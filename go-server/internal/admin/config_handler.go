package admin

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"

	"photo-loka/internal/config"
)

// ConfigHandler handles runtime configuration endpoints.
type ConfigHandler struct {
	rtConfig *config.RuntimeConfig
}

// NewConfigHandler creates a new ConfigHandler.
func NewConfigHandler(rtConfig *config.RuntimeConfig) *ConfigHandler {
	return &ConfigHandler{rtConfig: rtConfig}
}

// RegisterRoutes registers config management routes on the given router group.
func (h *ConfigHandler) RegisterRoutes(rg *gin.RouterGroup) {
	rg.GET("/getConfig", h.getConfig)
	rg.PUT("/updateConfig", h.updateConfig)
}

// getConfig returns the current runtime configuration.
// GET /api/admin/getConfig
func (h *ConfigHandler) getConfig(c *gin.Context) {
	c.JSON(http.StatusOK, h.rtConfig)
}

// updateConfig updates a single runtime config field.
// PUT /api/admin/updateConfig
func (h *ConfigHandler) updateConfig(c *gin.Context) {
	var body struct {
		Key   string      `json:"key" binding:"required"`
		Value interface{} `json:"value"`
	}

	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{
				"message": "Invalid request body: key is required",
				"code":    "INVALID_REQUEST",
			},
		})
		return
	}

	// Dispatch to the typed setter for the key. body.Value arrives from JSON as
	// interface{}, so JSON numbers are float64 and must be asserted/converted
	// here - the one honest coercion, at the HTTP edge.
	if err := h.dispatchUpdate(body.Key, body.Value); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{
				"message": err.Error(),
				"code":    "CONFIG_UPDATE_FAILED",
			},
		})
		return
	}

	// Return the actual stored value (after type conversion) rather than the raw input
	storedValue, _ := h.rtConfig.Get(body.Key)
	c.JSON(http.StatusOK, gin.H{
		"key":   body.Key,
		"value": storedValue,
	})
}

// dispatchUpdate routes an untyped API value to the matching typed setter,
// validating the JSON type per key.
func (h *ConfigHandler) dispatchUpdate(key string, value interface{}) error {
	rc := h.rtConfig
	switch key {
	case "startFileWatcherAtStartup":
		b, err := asBool(key, value)
		if err != nil {
			return err
		}
		return rc.SetStartFileWatcherAtStartup(b)
	case "startScheduledIndexingAtStartup":
		b, err := asBool(key, value)
		if err != nil {
			return err
		}
		return rc.SetStartScheduledIndexingAtStartup(b)
	case "auditFiles":
		b, err := asBool(key, value)
		if err != nil {
			return err
		}
		return rc.SetAuditFiles(b)
	case "geonamesHourlyLimit":
		n, err := asInt(key, value)
		if err != nil {
			return err
		}
		return rc.SetGeonamesHourlyLimit(n)
	case "geonamesDailyLimit":
		n, err := asInt(key, value)
		if err != nil {
			return err
		}
		return rc.SetGeonamesDailyLimit(n)
	case "videoEncoder":
		s, err := asString(key, value)
		if err != nil {
			return err
		}
		return rc.SetVideoEncoder(s)
	case "maxConcurrency":
		n, err := asInt(key, value)
		if err != nil {
			return err
		}
		return rc.SetMaxConcurrency(n)
	case "performFaceRecognition":
		b, err := asBool(key, value)
		if err != nil {
			return err
		}
		return rc.SetPerformFaceRecognition(b)
	default:
		return fmt.Errorf("unknown config key: %q", key)
	}
}

// asBool/asInt/asString convert a JSON-decoded value to a concrete type,
// returning a clear error on mismatch. JSON numbers decode to float64.
func asBool(key string, v interface{}) (bool, error) {
	b, ok := v.(bool)
	if !ok {
		return false, fmt.Errorf("config key %q expects a boolean, got %T", key, v)
	}
	return b, nil
}

func asInt(key string, v interface{}) (int, error) {
	f, ok := v.(float64)
	if !ok {
		return 0, fmt.Errorf("config key %q expects a number, got %T", key, v)
	}
	return int(f), nil
}

func asString(key string, v interface{}) (string, error) {
	s, ok := v.(string)
	if !ok {
		return "", fmt.Errorf("config key %q expects a string, got %T", key, v)
	}
	return s, nil
}
