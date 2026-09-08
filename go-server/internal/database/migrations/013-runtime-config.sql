-- Runtime config as a raw-valued key/value table.
-- 'value' holds the raw scalar as TEXT (e.g. 'libvpx-vp9', '4', 'true'), not
-- JSON-encoded. The type of each key is known in Go (config.RuntimeConfig
-- struct fields + typed setters/loader), so no data_type column is needed.
-- Booleans are stored lowercase 'true'/'false' (strconv.ParseBool on read).
CREATE TABLE runtime_config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Seed sensible defaults. These mirror the former runtime-config.json defaults.
INSERT INTO runtime_config (key, value) VALUES
    ('startFileWatcherAtStartup',            'true'),
    ('startScheduledIndexingAtStartup',      'true'),
    ('scanFilesForChangesAndIndexAtStartup', 'false'),
    ('filesDeletedThreshold',                '5'),
    ('auditFiles',                           'true'),
    ('geonamesHourlyLimit',                  '1000'),
    ('geonamesDailyLimit',                   '10000'),
    ('videoEncoder',                         'libvpx-vp9'),
    ('maxConcurrency',                       '4'),
    ('performFaceRecognition',               'true');
