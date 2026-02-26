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

	"src.techknowlogick.com/xormigrate"
	"xorm.io/xorm"
)

func init() {
	migrations = append(migrations, &xormigrate.Migration{
		ID:          "20260227000000",
		Description: "Convert auto_task_templates.project_id (single) to project_ids (JSON array)",
		Migrate: func(tx *xorm.Engine) error {
			// Step 1: Add the new project_ids JSON column
			_, err := tx.Exec(`ALTER TABLE auto_task_templates ADD COLUMN project_ids TEXT NULL`)
			if err != nil {
				return fmt.Errorf("add project_ids column: %w", err)
			}

			// Step 2: Migrate existing data — convert scalar project_id to JSON array
			// project_id > 0 → [project_id], NULL/0 → NULL (use default)
			_, err = tx.Exec(`
				UPDATE auto_task_templates
				SET project_ids = '[' || CAST(project_id AS TEXT) || ']'
				WHERE project_id IS NOT NULL AND project_id > 0
			`)
			if err != nil {
				return fmt.Errorf("migrate project_id to project_ids: %w", err)
			}

			// Step 3: Drop the old column
			// SQLite doesn't support DROP COLUMN before 3.35.0, so we use a safe approach
			// Just leave project_id in place — xorm will ignore it since the struct no longer references it
			return nil
		},
		Rollback: func(tx *xorm.Engine) error {
			return nil
		},
	})
}
