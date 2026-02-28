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
		ID:          "20260228000000",
		Description: "Ensure auto_task_templates has project_ids, label_ids, assignee_ids TEXT columns",
		Migrate: func(tx *xorm.Engine) error {
			// The original migration (20260224070000) used xorm Sync with
			// `xorm:"json null"` tags on LabelIDs and AssigneeIDs fields.
			// Depending on the xorm version and GonicMapper behavior, these
			// columns may have been created with unexpected names or not at all.
			//
			// This migration ensures all three JSON array columns exist with
			// the exact names the model and raw SQL expect.

			type colCheck struct {
				name     string
				fallback string // possible mangled name to rename from
			}

			columns := []colCheck{
				{name: "project_ids", fallback: ""},
				{name: "label_ids", fallback: "label_i_ds"},
				{name: "assignee_ids", fallback: "assignee_i_ds"},
			}

			for _, col := range columns {
				// Check if the correct column already exists
				exists, err := autoTaskColumnExists(tx, "auto_task_templates", col.name)
				if err != nil {
					return fmt.Errorf("check column %s: %w", col.name, err)
				}
				if exists {
					fmt.Printf("  Column %s already exists\n", col.name)
					continue
				}

				// Check if a mangled version exists that we can rename
				if col.fallback != "" {
					mangledExists, err := autoTaskColumnExists(tx, "auto_task_templates", col.fallback)
					if err != nil {
						return fmt.Errorf("check mangled column %s: %w", col.fallback, err)
					}
					if mangledExists {
						fmt.Printf("  Renaming %s -> %s\n", col.fallback, col.name)
						_, err = tx.Exec(fmt.Sprintf(
							"ALTER TABLE auto_task_templates CHANGE COLUMN `%s` `%s` TEXT NULL",
							col.fallback, col.name,
						))
						if err != nil {
							// MySQL-specific CHANGE failed, try generic RENAME COLUMN (MySQL 8+, SQLite 3.25+)
							_, err = tx.Exec(fmt.Sprintf(
								"ALTER TABLE auto_task_templates RENAME COLUMN `%s` TO `%s`",
								col.fallback, col.name,
							))
							if err != nil {
								return fmt.Errorf("rename %s to %s: %w", col.fallback, col.name, err)
							}
						}
						continue
					}
				}

				// Column doesn't exist at all — create it
				fmt.Printf("  Creating column %s\n", col.name)
				_, err = tx.Exec(fmt.Sprintf(
					"ALTER TABLE auto_task_templates ADD COLUMN `%s` TEXT NULL",
					col.name,
				))
				if err != nil {
					return fmt.Errorf("add column %s: %w", col.name, err)
				}
			}

			return nil
		},
		Rollback: func(tx *xorm.Engine) error {
			return nil
		},
	})
}

// autoTaskColumnExists checks whether a column exists in a table (MySQL, SQLite, PostgreSQL).
func autoTaskColumnExists(tx *xorm.Engine, table, column string) (bool, error) {
	// Try MySQL / MariaDB first
	rows, err := tx.Query(
		"SELECT COUNT(*) AS cnt FROM information_schema.columns WHERE table_name = ? AND column_name = ?",
		table, column,
	)
	if err == nil && len(rows) > 0 {
		cnt := string(rows[0]["cnt"])
		return cnt != "0", nil
	}

	// Fallback: SQLite pragma
	pragmaRows, err := tx.Query(fmt.Sprintf("PRAGMA table_info(%s)", table))
	if err == nil {
		for _, row := range pragmaRows {
			if string(row["name"]) == column {
				return true, nil
			}
		}
		return false, nil
	}

	return false, fmt.Errorf("could not determine if column %s.%s exists", table, column)
}
