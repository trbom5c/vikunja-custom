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
	"xorm.io/xorm"
)

// UserPreference represents a single key-value preference for a user.
type UserPreference struct {
	ID      int64  `xorm:"bigint autoincr not null unique pk" json:"id"`
	UserID  int64  `xorm:"bigint not null" json:"-"`
	Key     string `xorm:"varchar(255) not null" json:"key"`
	Value   string `xorm:"text not null" json:"value"`
	Created int64  `xorm:"created not null" json:"created"`
	Updated int64  `xorm:"updated not null" json:"updated"`
}

func (UserPreference) TableName() string {
	return "user_preferences"
}

// GetUserPreferences returns all preferences for a user.
func GetUserPreferences(s *xorm.Session, userID int64) (map[string]string, error) {
	var prefs []UserPreference
	err := s.Where("user_id = ?", userID).Find(&prefs)
	if err != nil {
		return nil, err
	}

	result := make(map[string]string, len(prefs))
	for _, p := range prefs {
		result[p.Key] = p.Value
	}
	return result, nil
}

// SetUserPreference upserts a single preference for a user.
func SetUserPreference(s *xorm.Session, userID int64, key, value string) error {
	existing := &UserPreference{}
	has, err := s.Where("user_id = ? AND `key` = ?", userID, key).Get(existing)
	if err != nil {
		return err
	}

	if has {
		existing.Value = value
		_, err = s.ID(existing.ID).Cols("value").Update(existing)
		return err
	}

	_, err = s.Insert(&UserPreference{
		UserID: userID,
		Key:    key,
		Value:  value,
	})
	return err
}

// SetUserPreferences upserts multiple preferences for a user.
func SetUserPreferences(s *xorm.Session, userID int64, prefs map[string]string) error {
	for key, value := range prefs {
		if err := SetUserPreference(s, userID, key, value); err != nil {
			return err
		}
	}
	return nil
}

// DeleteUserPreference removes a single preference for a user.
func DeleteUserPreference(s *xorm.Session, userID int64, key string) error {
	_, err := s.Where("user_id = ? AND `key` = ?", userID, key).Delete(&UserPreference{})
	return err
}
