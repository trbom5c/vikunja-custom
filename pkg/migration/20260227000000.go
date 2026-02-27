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

package migration

import (
	"fmt"
	"strconv"

	"src.techknowlogick.com/xormigrate"
	"xorm.io/xorm"
)

type autoTaskMigrate20260227000000 struct {
	ID         int64  `xorm:"bigint autoincr not null unique pk"`
	ProjectID  int64  `xorm:"bigint null"`
	ProjectIDs string `xorm:"text null"`
}

func (autoTaskMigrate20260227000000) TableName() string {
	return "auto_task_templates"
}

func init() {
	migrations = append(migrations, &xormigrate.Migration{
		ID:          "20260227000000",
		Description: "Convert auto_task_templates.project_id (single) to project_ids (JSON array)",
		Migrate: func(tx *xorm.Engine) error {
			// Ensure project_ids column exists
			if err := tx.Sync(autoTaskMigrate20260227000000{}); err != nil {
				return fmt.Errorf("sync auto_task_templates: %w", err)
			}

			// Migrate data using Go (works on PostgreSQL, MySQL, and SQLite)
			var templates []autoTaskMigrate20260227000000
			err := tx.Where("project_id IS NOT NULL AND project_id > 0").
				Where("project_ids IS NULL OR project_ids = '' OR project_ids = 'null'").
				Find(&templates)
			if err != nil {
				return fmt.Errorf("find templates to migrate: %w", err)
			}

			for _, t := range templates {
				newVal := "[" + strconv.FormatInt(t.ProjectID, 10) + "]"
				_, err := tx.Exec(
					"UPDATE auto_task_templates SET project_ids = ? WHERE id = ?",
					newVal, t.ID,
				)
				if err != nil {
					return fmt.Errorf("migrate template %d: %w", t.ID, err)
				}
			}

			return nil
		},
		Rollback: func(tx *xorm.Engine) error {
			return nil
		},
	})
}
