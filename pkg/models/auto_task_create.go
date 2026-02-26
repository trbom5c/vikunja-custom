// Vikunja is a to-do list application to facilitate your life.
// Copyright 2018-present Vikunja and contributors. All rights reserved.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

package models

import (
	"fmt"
	"time"

	"code.vikunja.io/api/pkg/files"
	"code.vikunja.io/api/pkg/log"
	"code.vikunja.io/api/pkg/user"
	"code.vikunja.io/api/pkg/web"

	"xorm.io/xorm"
)

// CheckAndCreateAutoTasks scans all active auto-task templates for a user
// and creates task instances for any that are due.
//
// Simplified scheduling logic:
//  1. Is next_due_at <= now? (template is due)
//  2. Does an open (not done) task already exist? If yes → skip.
//  3. Generate the task + advance next_due_at to the next generate-at time.
//
// Manual triggers ("Send to project now") never touch next_due_at.
func CheckAndCreateAutoTasks(s *xorm.Session, u *user.User) ([]*Task, error) {
	now := time.Now()

	// Find all active templates where next_due_at <= now
	templates := []*AutoTaskTemplate{}
	err := s.Where("owner_id = ? AND active = ? AND next_due_at <= ?", u.ID, true, now).Find(&templates)
	if err != nil {
		return nil, err
	}

	created := make([]*Task, 0)

	for _, tmpl := range templates {
		// Check if end_date has passed
		if tmpl.EndDate != nil && now.After(*tmpl.EndDate) {
			tmpl.Active = false
			_, _ = s.ID(tmpl.ID).Cols("active").Update(tmpl)
			continue
		}

		// Does an open (not done) task already exist for this template?
		openCount, err := s.Where("auto_template_id = ? AND done = ?", tmpl.ID, false).Count(&Task{})
		if err != nil {
			return nil, err
		}
		if openCount > 0 {
			continue
		}

		// All clear — generate the task
		task, err := createAutoTaskInstance(s, tmpl, u, "system")
		if err != nil {
			return nil, err
		}
		if task != nil {
			created = append(created, task)
		}
	}

	return created, nil
}

// TriggerAutoTask manually creates a task from an auto-task template immediately,
// regardless of its schedule. Respects the "one open instance" rule.
// Does NOT advance next_due_at — manual triggers are "extra" tasks.
func TriggerAutoTask(s *xorm.Session, templateID int64, u *user.User) (*Task, error) {
	tmpl := &AutoTaskTemplate{}
	has, err := s.Where("id = ? AND owner_id = ?", templateID, u.ID).Get(tmpl)
	if err != nil {
		return nil, err
	}
	if !has {
		return nil, ErrAutoTaskTemplateNotFound{ID: templateID}
	}

	// Check for existing open instance
	openCount, err := s.Where("auto_template_id = ? AND done = ?", tmpl.ID, false).Count(&Task{})
	if err != nil {
		return nil, err
	}
	if openCount > 0 {
		return nil, fmt.Errorf("an open task already exists for this template — complete it first")
	}

	return createAutoTaskInstance(s, tmpl, u, "manual")
}

// OnAutoTaskCompleted should be called when a task with auto_template_id is marked done.
//
// For SCHEDULED tasks: updates last_completed_at. Schedule already advanced at
// creation time, so nothing else to do.
//
// For MANUAL tasks: only updates last_completed_at. The schedule stays put.
func OnAutoTaskCompleted(s *xorm.Session, task *Task) error {
	// Check if this task has an auto_template_id
	var autoTemplateID int64
	has, err := s.SQL(
		"SELECT auto_template_id FROM tasks WHERE id = ? AND auto_template_id IS NOT NULL AND auto_template_id > 0",
		task.ID,
	).Get(&autoTemplateID)
	if err != nil || !has || autoTemplateID == 0 {
		return err
	}

	tmpl := &AutoTaskTemplate{}
	has, err = s.ID(autoTemplateID).Get(tmpl)
	if err != nil || !has {
		return err
	}

	now := time.Now()
	tmpl.LastCompletedAt = &now

	// Just update last_completed_at. The schedule (next_due_at) was already
	// advanced when the task was created (for system triggers), or left alone
	// (for manual triggers). No need to touch it again here.
	_, err = s.ID(tmpl.ID).Cols("last_completed_at").Update(tmpl)
	return err
}

// ResetAutoTaskSchedule resets next_due_at to the next upcoming generate-at time.
// This is the "panic button" for when the schedule has drifted or run away.
func ResetAutoTaskSchedule(s *xorm.Session, templateID int64, ownerID int64) (*time.Time, error) {
	tmpl := &AutoTaskTemplate{}
	has, err := s.Where("id = ? AND owner_id = ?", templateID, ownerID).Get(tmpl)
	if err != nil {
		return nil, err
	}
	if !has {
		return nil, ErrAutoTaskTemplateNotFound{ID: templateID}
	}

	// Force-calculate the next generate-at time from NOW, ignoring all history
	nextDue := nextGenerateAtFromNow(tmpl)
	tmpl.NextDueAt = &nextDue

	_, err = s.ID(tmpl.ID).Cols("next_due_at").Update(tmpl)
	if err != nil {
		return nil, err
	}

	log.Infof("[Auto-Task] Schedule reset for template %d (%s) — next_due_at set to %s",
		tmpl.ID, tmpl.Title, nextDue.Format(time.RFC3339))

	return &nextDue, nil
}

// nextGenerateAt finds the next occurrence of the generate-at time that is in
// the future AND at least 1 interval from the current next_due_at.
// Used after creating a scheduled task to advance the schedule.
func nextGenerateAt(tmpl *AutoTaskTemplate) time.Time {
	now := time.Now()

	genHour := tmpl.StartDate.Hour()
	genMin := tmpl.StartDate.Minute()
	loc := tmpl.StartDate.Location()
	if loc == nil {
		loc = time.UTC
	}

	// Anchor from the current next_due_at (the slot we just consumed)
	anchor := now
	if tmpl.NextDueAt != nil && !tmpl.NextDueAt.IsZero() {
		anchor = *tmpl.NextDueAt
	}

	// Add one interval from the anchor
	candidate := advanceFromTime(anchor, tmpl.IntervalValue, tmpl.IntervalUnit)

	// Snap to generate-at time of day
	candidate = time.Date(
		candidate.Year(), candidate.Month(), candidate.Day(),
		genHour, genMin, 0, 0, loc,
	)

	// Safety: if still in the past, keep advancing
	for !candidate.After(now) {
		candidate = advanceFromTime(candidate, tmpl.IntervalValue, tmpl.IntervalUnit)
		candidate = time.Date(
			candidate.Year(), candidate.Month(), candidate.Day(),
			genHour, genMin, 0, 0, loc,
		)
	}

	return candidate
}

// nextGenerateAtFromNow calculates the next generate-at time purely from NOW,
// ignoring all scheduling history. Used by the reset function.
func nextGenerateAtFromNow(tmpl *AutoTaskTemplate) time.Time {
	now := time.Now()

	genHour := tmpl.StartDate.Hour()
	genMin := tmpl.StartDate.Minute()
	loc := tmpl.StartDate.Location()
	if loc == nil {
		loc = time.UTC
	}

	// Today at the generate-at time
	candidate := time.Date(
		now.Year(), now.Month(), now.Day(),
		genHour, genMin, 0, 0, loc,
	)

	// If that's already passed today, go to tomorrow
	if !candidate.After(now) {
		candidate = candidate.AddDate(0, 0, 1)
	}

	return candidate
}

// createAutoTaskInstance handles the actual task creation, label/assignee assignment,
// and logging for both auto-check and manual triggers.
func createAutoTaskInstance(s *xorm.Session, tmpl *AutoTaskTemplate, u *user.User, triggerType string) (*Task, error) {
	// Determine the target project
	projectID := tmpl.ProjectID
	if projectID == 0 {
		projectID = u.DefaultProjectID
		if projectID == 0 {
			inbox := &Project{}
			has, err := s.Where("owner_id = ? AND is_archived = ?", u.ID, false).
				OrderBy("id ASC").Limit(1).Get(inbox)
			if err != nil {
				return nil, err
			}
			if !has {
				return nil, fmt.Errorf("no project found for user %d", u.ID)
			}
			projectID = inbox.ID
		}
	}

	// Build and create the task
	dueDate := time.Now()
	if tmpl.NextDueAt != nil {
		dueDate = *tmpl.NextDueAt
	}

	task := &Task{
		Title:          tmpl.Title,
		Description:    tmpl.Description,
		Priority:       tmpl.Priority,
		HexColor:       tmpl.HexColor,
		ProjectID:      projectID,
		DueDate:        dueDate,
		AutoTemplateID: tmpl.ID,
	}

	err := createTask(s, task, u, false, true)
	if err != nil {
		return nil, fmt.Errorf("auto-task create failed for template %d: %w", tmpl.ID, err)
	}

	// Ensure auto_template_id is persisted
	_, _ = s.Exec("UPDATE tasks SET auto_template_id = ? WHERE id = ?", tmpl.ID, task.ID)

	// Add labels
	for _, labelID := range tmpl.LabelIDs {
		lt := &LabelTask{LabelID: labelID, TaskID: task.ID}
		_, _ = s.Insert(lt)
	}

	// Add assignees
	for _, assigneeID := range tmpl.AssigneeIDs {
		ta := &TaskAssginee{TaskID: task.ID, UserID: assigneeID}
		_, _ = s.Insert(ta)
	}

	// Copy attachments from template
	copyAutoTaskTemplateAttachments(s, tmpl.ID, task.ID, u)

	// Update template tracking
	nowTime := time.Now()
	tmpl.LastCreatedAt = &nowTime

	// Only advance next_due_at for scheduled triggers.
	// Manual triggers don't touch the schedule.
	if triggerType != "manual" {
		nextDue := nextGenerateAt(tmpl)
		tmpl.NextDueAt = &nextDue
		_, _ = s.ID(tmpl.ID).Cols("last_created_at", "next_due_at").Update(tmpl)
	} else {
		_, _ = s.ID(tmpl.ID).Cols("last_created_at").Update(tmpl)
	}

	// Log the generation event
	triggeredBy := int64(0)
	if triggerType == "manual" {
		triggeredBy = u.ID
	}
	logEntry := &AutoTaskLog{
		TemplateID:    tmpl.ID,
		TaskID:        task.ID,
		TriggerType:   triggerType,
		TriggeredByID: triggeredBy,
	}
	_, _ = s.Insert(logEntry)

	return task, nil
}

// advanceFromTime calculates the next due date by adding one interval to the given time.
func advanceFromTime(from time.Time, intervalValue int, intervalUnit string) time.Time {
	switch intervalUnit {
	case "hours":
		return from.Add(time.Duration(intervalValue) * time.Hour)
	case "weeks":
		return from.AddDate(0, 0, intervalValue*7)
	case "months":
		return from.AddDate(0, intervalValue, 0)
	default: // days
		return from.AddDate(0, 0, intervalValue)
	}
}

// TriggerAutoTaskFromAuth is a convenience wrapper that resolves the user from web.Auth.
func TriggerAutoTaskFromAuth(s *xorm.Session, templateID int64, auth web.Auth) (*Task, error) {
	u := auth.(*user.User)
	return TriggerAutoTask(s, templateID, u)
}

// CheckAutoTasksFromAuth is a convenience wrapper that resolves the user from web.Auth.
func CheckAutoTasksFromAuth(s *xorm.Session, auth web.Auth) ([]*Task, error) {
	u := auth.(*user.User)
	return CheckAndCreateAutoTasks(s, u)
}

// copyAutoTaskTemplateAttachments copies all file attachments from an auto-task
// template to a newly generated task.
func copyAutoTaskTemplateAttachments(s *xorm.Session, templateID, taskID int64, u *user.User) {
	templateAttachments := make([]*AutoTaskTemplateAttachment, 0)
	err := s.Where("template_id = ?", templateID).Find(&templateAttachments)
	if err != nil {
		log.Errorf("[Auto-Task] Could not load template attachments for template %d: %s", templateID, err)
		return
	}

	if len(templateAttachments) == 0 {
		return
	}

	for _, tmplAttach := range templateAttachments {
		srcFile := &files.File{ID: tmplAttach.FileID}
		if err := srcFile.LoadFileMetaByID(); err != nil {
			log.Debugf("[Auto-Task] Skipping attachment %d: file %d metadata not found: %s", tmplAttach.ID, tmplAttach.FileID, err)
			continue
		}

		if err := srcFile.LoadFileByID(); err != nil {
			log.Debugf("[Auto-Task] Skipping attachment %d: could not load file %d: %s", tmplAttach.ID, tmplAttach.FileID, err)
			continue
		}

		newAttachment := &TaskAttachment{
			TaskID: taskID,
		}
		err := newAttachment.NewAttachment(s, srcFile.File, srcFile.Name, srcFile.Size, u)
		if err != nil {
			log.Errorf("[Auto-Task] Could not copy attachment %d to task %d: %s", tmplAttach.ID, taskID, err)
		}

		if srcFile.File != nil {
			_ = srcFile.File.Close()
		}

		log.Debugf("[Auto-Task] Copied attachment '%s' (file %d) to task %d as attachment %d",
			srcFile.Name, tmplAttach.FileID, taskID, newAttachment.ID)
	}
}
