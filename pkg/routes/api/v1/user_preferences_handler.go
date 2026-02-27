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

package v1

import (
	"net/http"

	"code.vikunja.io/api/pkg/db"
	"code.vikunja.io/api/pkg/models"
	auth2 "code.vikunja.io/api/pkg/modules/auth"

	"github.com/labstack/echo/v5"
)

// GetUserPreferences returns all preferences for the authenticated user.
// @Summary Get user preferences
// @tags user
// @Accept json
// @Produce json
// @Security JWTKeyAuth
// @Success 200 {object} map[string]string
// @Router /user/settings/preferences [get]
func GetUserPreferences(c *echo.Context) error {
	auth, err := auth2.GetAuthFromClaims(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "Unauthorized")
	}

	s := db.NewSession()
	defer s.Close()

	prefs, err := models.GetUserPreferences(s, auth.GetID())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Could not get preferences")
	}

	return c.JSON(http.StatusOK, prefs)
}

// SaveUserPreferences upserts one or more preferences for the authenticated user.
// @Summary Save user preferences
// @tags user
// @Accept json
// @Produce json
// @Security JWTKeyAuth
// @Param preferences body map[string]string true "Key-value pairs to save"
// @Success 200 {object} map[string]string
// @Router /user/settings/preferences [post]
func SaveUserPreferences(c *echo.Context) error {
	auth, err := auth2.GetAuthFromClaims(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "Unauthorized")
	}

	var input map[string]string
	if err := c.Bind(&input); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "Invalid request body")
	}

	if len(input) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "No preferences provided")
	}

	// Limit key length and count
	if len(input) > 50 {
		return echo.NewHTTPError(http.StatusBadRequest, "Too many preferences (max 50)")
	}
	for key, value := range input {
		if len(key) > 255 {
			return echo.NewHTTPError(http.StatusBadRequest, "Key too long (max 255 chars)")
		}
		if len(value) > 10000 {
			return echo.NewHTTPError(http.StatusBadRequest, "Value too long (max 10000 chars)")
		}
	}

	s := db.NewSession()
	defer s.Close()

	if err := s.Begin(); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Could not start transaction")
	}

	if err := models.SetUserPreferences(s, auth.GetID(), input); err != nil {
		_ = s.Rollback()
		return echo.NewHTTPError(http.StatusInternalServerError, "Could not save preferences")
	}

	if err := s.Commit(); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Could not commit")
	}

	// Return the full updated set
	s2 := db.NewSession()
	defer s2.Close()

	prefs, err := models.GetUserPreferences(s2, auth.GetID())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Could not read back preferences")
	}

	return c.JSON(http.StatusOK, prefs)
}

// DeleteUserPreference removes a single preference for the authenticated user.
// @Summary Delete a user preference
// @tags user
// @Accept json
// @Produce json
// @Security JWTKeyAuth
// @Param key path string true "Preference key to delete"
// @Success 200 {object} models.Message
// @Router /user/settings/preferences/{key} [delete]
func DeleteUserPreference(c *echo.Context) error {
	auth, err := auth2.GetAuthFromClaims(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "Unauthorized")
	}

	key := c.Param("key")
	if key == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "Key is required")
	}

	s := db.NewSession()
	defer s.Close()

	if err := s.Begin(); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Could not start transaction")
	}

	if err := models.DeleteUserPreference(s, auth.GetID(), key); err != nil {
		_ = s.Rollback()
		return echo.NewHTTPError(http.StatusInternalServerError, "Could not delete preference")
	}

	if err := s.Commit(); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Could not commit")
	}

	return c.JSON(http.StatusOK, models.Message{Message: "Preference deleted"})
}
