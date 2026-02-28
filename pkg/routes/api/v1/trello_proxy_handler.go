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
	"fmt"
	"io"
	"net/http"

	"github.com/labstack/echo/v4"
)

// TrelloProxyDownload proxies a download request to the Trello API,
// avoiding CORS issues when the browser fetches Trello attachments.
// The frontend sends the Trello URL + credentials and this endpoint
// streams the file back.
//
// POST /api/v1/trello/proxy-download
// Body: { "url": "https://api.trello.com/1/cards/.../download/file.jpg", "key": "...", "token": "..." }
func TrelloProxyDownload(c echo.Context) error {
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

	// Only allow proxying to Trello API domains
	if len(req.URL) < 30 ||
		(req.URL[:30] != "https://api.trello.com/1/cards" &&
			req.URL[:26] != "https://trello.com/1/cards") {
		return echo.NewHTTPError(http.StatusBadRequest, "url must be a Trello card attachment URL")
	}

	// Append auth to the Trello URL
	separator := "?"
	if len(req.URL) > 0 {
		for _, ch := range req.URL {
			if ch == '?' {
				separator = "&"
				break
			}
		}
	}
	trelloURL := fmt.Sprintf("%s%skey=%s&token=%s", req.URL, separator, req.Key, req.Token)

	// Fetch from Trello
	resp, err := http.Get(trelloURL)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, fmt.Sprintf("failed to fetch from Trello: %v", err))
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return echo.NewHTTPError(resp.StatusCode, fmt.Sprintf("Trello returned %d: %s", resp.StatusCode, string(body)))
	}

	// Stream the response back
	c.Response().Header().Set("Content-Type", resp.Header.Get("Content-Type"))
	if cl := resp.Header.Get("Content-Length"); cl != "" {
		c.Response().Header().Set("Content-Length", cl)
	}
	if cd := resp.Header.Get("Content-Disposition"); cd != "" {
		c.Response().Header().Set("Content-Disposition", cd)
	}

	c.Response().WriteHeader(http.StatusOK)
	_, err = io.Copy(c.Response().Writer, resp.Body)
	return err
}
