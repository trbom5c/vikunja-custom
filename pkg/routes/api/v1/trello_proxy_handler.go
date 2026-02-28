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
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"

	"github.com/labstack/echo/v5"
)

// trelloAttURLPattern extracts cardId and attachmentId from a Trello attachment URL.
var trelloAttURLPattern = regexp.MustCompile(
	`https://(?:api\.)?trello\.com/1/cards/([a-f0-9]+)/attachments/([a-f0-9]+)`,
)

// TrelloProxyDownload proxies a download request to the Trello API,
// avoiding CORS issues when the browser fetches Trello attachments.
//
// Two-step flow:
//  1. Fetch attachment metadata from Trello API to get the pre-signed download URL
//  2. Fetch the actual file from that pre-signed URL (no auth needed)
//
// POST /api/v1/trello/proxy-download
// Body: { "url": "https://api.trello.com/1/cards/.../attachments/.../download/file.jpg", "key": "...", "token": "..." }
func TrelloProxyDownload(c *echo.Context) error {
	var req struct {
		URL   string `json:"url"`
		Key   string `json:"key"`
		Token string `json:"token"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	if req.URL == "" || req.Key == "" || req.Token == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "url, key, and token are required")
	}

	// Extract cardId and attachmentId from the URL
	matches := trelloAttURLPattern.FindStringSubmatch(req.URL)
	if len(matches) < 3 {
		return echo.NewHTTPError(http.StatusBadRequest, "url must be a Trello card attachment URL")
	}
	cardID := matches[1]
	attachmentID := matches[2]

	// Step 1: Fetch attachment metadata to get the pre-signed download URL
	metaURL := fmt.Sprintf(
		"https://api.trello.com/1/cards/%s/attachments/%s?key=%s&token=%s",
		cardID, attachmentID, req.Key, req.Token,
	)

	metaResp, err := http.Get(metaURL) // nolint:gosec
	if err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, fmt.Sprintf("failed to fetch attachment metadata: %v", err))
	}
	defer metaResp.Body.Close()

	if metaResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(metaResp.Body, 1024))
		return echo.NewHTTPError(metaResp.StatusCode, fmt.Sprintf("Trello metadata %d: %s", metaResp.StatusCode, string(body)))
	}

	var meta struct {
		URL      string `json:"url"`
		MimeType string `json:"mimeType"`
		Name     string `json:"name"`
	}
	if err := json.NewDecoder(metaResp.Body).Decode(&meta); err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, fmt.Sprintf("failed to parse attachment metadata: %v", err))
	}

	if meta.URL == "" {
		return echo.NewHTTPError(http.StatusBadGateway, "Trello attachment metadata has no download URL")
	}

	// Step 2: Fetch the actual file from the pre-signed URL
	fileResp, err := http.Get(meta.URL) // nolint:gosec
	if err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, fmt.Sprintf("failed to download file: %v", err))
	}
	defer fileResp.Body.Close()

	if fileResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(fileResp.Body, 1024))
		return echo.NewHTTPError(fileResp.StatusCode, fmt.Sprintf("file download %d: %s", fileResp.StatusCode, string(body)))
	}

	// Stream the response back
	contentType := fileResp.Header.Get("Content-Type")
	if contentType == "" {
		if meta.MimeType != "" {
			contentType = meta.MimeType
		} else {
			contentType = "application/octet-stream"
		}
	}

	if cd := fileResp.Header.Get("Content-Disposition"); cd != "" {
		c.Response().Header().Set("Content-Disposition", cd)
	}
	if cl := fileResp.Header.Get("Content-Length"); cl != "" {
		c.Response().Header().Set("Content-Length", cl)
	}

	return c.Stream(http.StatusOK, contentType, fileResp.Body)
}
