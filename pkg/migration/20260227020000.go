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
	"src.techknowlogick.com/xormigrate"
	"xorm.io/xorm"
)

type userPreference20260227020000 struct {
	ID      int64  `xorm:"bigint autoincr not null unique pk"`
	UserID  int64  `xorm:"bigint not null"`
	Key     string `xorm:"varchar(255) not null"`
	Value   string `xorm:"text not null"`
	Created int64  `xorm:"created not null"`
	Updated int64  `xorm:"updated not null"`
}

func (userPreference20260227020000) TableName() string {
	return "user_preferences"
}

func init() {
	migrations = append(migrations, &xormigrate.Migration{
		ID:          "20260227020000",
		Description: "Create user_preferences table for per-user settings (gantt config, etc.)",
		Migrate: func(tx *xorm.Engine) error {
			if err := tx.Sync(userPreference20260227020000{}); err != nil {
				return err
			}

			// Add unique index on (user_id, key)
			_, err := tx.Exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_user_pref_user_key ON user_preferences (user_id, `key`)")
			return err
		},
		Rollback: func(tx *xorm.Engine) error {
			return tx.DropTables(userPreference20260227020000{})
		},
	})
}
