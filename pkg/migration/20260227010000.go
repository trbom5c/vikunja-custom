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

type autoTaskFixMigrate20260227010000 struct {
	ID         int64  `xorm:"bigint autoincr not null unique pk"`
	ProjectID  int64  `xorm:"bigint null"`
	ProjectIDs string `xorm:"text null"`
}

func (autoTaskFixMigrate20260227010000) TableName() string {
	return "auto_task_templates"
}

func init() {
	migrations = append(migrations, &xormigrate.Migration{
		ID:          "20260227010000",
		Description: "Fix auto_task_templates project_id -> project_ids migration (database-agnostic)",
		Migrate: func(tx *xorm.Engine) error {
			// Ensure the project_ids column exists (in case 20260227000000 failed)
			if err := tx.Sync(autoTaskFixMigrate20260227010000{}); err != nil {
				return fmt.Errorf("sync auto_task_templates: %w", err)
			}

			// Use raw SQL to avoid xorm generating SELECT with columns that may not exist
			rows, err := tx.Query("SELECT id, project_id FROM auto_task_templates WHERE project_id IS NOT NULL AND project_id > 0")
			if err != nil {
				return fmt.Errorf("query templates: %w", err)
			}

			fixed := 0
			for _, row := range rows {
				idStr := string(row["id"])
				pidStr := string(row["project_id"])

				id, err1 := strconv.ParseInt(idStr, 10, 64)
				pid, err2 := strconv.ParseInt(pidStr, 10, 64)
				if err1 != nil || err2 != nil {
					continue
				}

				expected := "[" + strconv.FormatInt(pid, 10) + "]"
				_, err := tx.Exec(
					"UPDATE auto_task_templates SET project_ids = ? WHERE id = ? AND (project_ids IS NULL OR project_ids = '' OR project_ids = 'null' OR project_ids != ?)",
					expected, id, expected,
				)
				if err != nil {
					return fmt.Errorf("fix template %d project_ids: %w", id, err)
				}
				fixed++
			}

			if fixed > 0 {
				fmt.Printf("  Fixed project_ids for %d auto-task template(s)\n", fixed)
			}

			return nil
		},
		Rollback: func(tx *xorm.Engine) error {
			return nil
		},
	})
}
