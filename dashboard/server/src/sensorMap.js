// Maps metric keys to MQTT topics (= InfluxDB `sensor` tag values)
const SENSOR_MAP = {
  co2:         'home/air/co2',
  pm1:         'home/air/pm1',
  pm2p5:       'home/air/pm2p5',
  pm4:         'home/air/pm4',
  pm10:        'home/air/pm10',
  voc:         'home/air/voc',
  nox:         'home/air/nox',
  temperature: 'home/air/temperature',
  humidity:    'home/air/humidity',
  o3:          'home/air/o3',
  no2:         'home/air/no2/ppm',
  no2_rs:      'home/air/no2/rs',
  no2_ratio:   'home/air/no2/ratio',
  co:          'home/air/mics/co',
  c2h5oh:      'home/air/mics/c2h5oh',
  ch4:         'home/air/mics/ch4',
  h2:          'home/air/mics/h2',
  nh3:         'home/air/mics/nh3',
  sen0132_co:    'home/air/sen0132/co',
  sen0132_rs:    'home/air/sen0132/rs',
  sen0132_ratio: 'home/air/sen0132/ratio',
  pressure:      'home/air/bmp388/pressure',
  altitude:      'home/air/bmp388/altitude',
  bmp_temp:      'home/air/bmp388/temperature',
};

const TOPIC_TO_KEY = Object.fromEntries(Object.entries(SENSOR_MAP).map(([k, v]) => [v, k]));

const METRIC_META = {
  co2:         { label: 'CO2',         unit: 'ppm',    dp: 0 },
  no2:         { label: 'NO2',         unit: 'ppm',    dp: 3 },
  o3:          { label: 'O3',          unit: 'ppb',    dp: 1 },
  voc:         { label: 'VOC Index',   unit: 'index',  dp: 0 },
  nox:         { label: 'NOx Index',   unit: 'index',  dp: 0 },
  temperature: { label: 'Temperature', unit: '°C',     dp: 1 },
  humidity:    { label: 'Humidity',    unit: '%',      dp: 1 },
  pm1:         { label: 'PM1',         unit: 'µg/m³',  dp: 1 },
  pm2p5:       { label: 'PM2.5',       unit: 'µg/m³',  dp: 1 },
  pm4:         { label: 'PM4',         unit: 'µg/m³',  dp: 1 },
  pm10:        { label: 'PM10',        unit: 'µg/m³',  dp: 1 },
  co:          { label: 'CO',          unit: 'ppm',    dp: 2 },
  c2h5oh:      { label: 'C2H5OH',      unit: 'ppm',    dp: 2 },
  ch4:         { label: 'CH4',         unit: 'ppm',    dp: 1 },
  h2:          { label: 'H2',          unit: 'ppm',    dp: 1 },
  nh3:         { label: 'NH3',         unit: 'ppm',    dp: 2 },
  no2_rs:      { label: 'NO2 Rs',      unit: 'kΩ',     dp: 1 },
  no2_ratio:   { label: 'NO2 Rs/R0',   unit: 'Rs/R0',  dp: 3 },
  sen0132_co:    { label: 'CO (SEN0132)',  unit: 'ppm',    dp: 1 },
  sen0132_rs:    { label: 'CO Rs',         unit: 'kΩ',     dp: 1 },
  sen0132_ratio: { label: 'CO Rs/R0',      unit: 'Rs/R0',  dp: 3 },
  pressure:      { label: 'Pressure',      unit: 'hPa',    dp: 1 },
  altitude:      { label: 'Altitude',      unit: 'm',      dp: 0 },
  bmp_temp:      { label: 'Temp (BMP388)', unit: '°C',     dp: 1 },
};

const SPIKE_THRESHOLDS = {
  co2:    1500,
  no2:    0.1,
  o3:     100,
  voc:    200,
  pm2p5:  35,
  co:     10,
  c2h5oh: 100,
  ch4:    500,
  h2:     200,
  sen0132_co: 10,
};

// Ordered lists used for queries and UI grouping
const ALL_KEYS        = Object.keys(SENSOR_MAP);
const NOXIOUS_KEYS    = ['co', 'c2h5oh', 'ch4', 'h2', 'nox', 'sen0132_co'];
const PRIMARY_METRICS = ['co2', 'no2', 'o3', 'voc', 'temperature', 'humidity', 'pm1', 'pm2p5', 'pressure'];
const PARTICULATE_KEYS = ['pm1', 'pm2p5', 'pm4', 'pm10'];
const OVERNIGHT_KEYS  = ['co2', 'no2', 'temperature', 'humidity', 'o3', 'pm1', 'pm2p5', 'pm4', 'pm10', 'nox', 'pressure'];
const TREND_METRICS   = ['co2', 'no2', 'o3', 'voc', 'nox', 'temperature', 'humidity', 'pm2p5', 'pressure'];
const INSIGHT_METRICS = ['co2', 'pm2p5', 'pm1', 'o3', 'no2', 'nox', 'voc', 'temperature', 'humidity', 'pressure'];

const PRIMARY_CORRELATIONS = {
  co2:         { key: 'nox',      label: 'NOx',      r: -0.72 },
  nox:         { key: 'co2',      label: 'CO2',      r: -0.72 },
  temperature: { key: 'humidity', label: 'Humidity', r: -0.68 },
  humidity:    { key: 'pm2p5',    label: 'PM2.5',    r:  0.64 },
  pm2p5:       { key: 'humidity', label: 'Humidity', r:  0.58 },
  pm1:         { key: 'pm2p5',    label: 'PM2.5',    r:  0.94 },
  pm4:         { key: 'pm2p5',    label: 'PM2.5',    r:  0.91 },
  pm10:        { key: 'pm2p5',    label: 'PM2.5',    r:  0.89 },
  o3:          { key: 'voc',      label: 'VOC',      r:  0.61 },
  voc:         { key: 'o3',       label: 'O3',       r:  0.61 },
  no2:         { key: 'co2',      label: 'CO2',      r:  0.54 },
  co:          { key: 'humidity', label: 'Humidity', r:  0.49 },
  h2:          { key: 'co',       label: 'CO',       r:  0.67 },
  ch4:         { key: 'co',       label: 'CO',       r:  0.71 },
  c2h5oh:      { key: 'voc',      label: 'VOC',      r:  0.58 },
  nh3:         { key: 'humidity', label: 'Humidity', r:  0.44 },
  no2_rs:      { key: 'no2',      label: 'NO2',      r: -0.96 },
  no2_ratio:   { key: 'no2',      label: 'NO2',      r: -0.95 },
  sen0132_co:    { key: 'humidity', label: 'Humidity', r:  0.49 },
  pressure:      { key: 'humidity', label: 'Humidity', r: -0.41 },
};

module.exports = {
  SENSOR_MAP, TOPIC_TO_KEY, METRIC_META, SPIKE_THRESHOLDS,
  ALL_KEYS, NOXIOUS_KEYS, PRIMARY_METRICS, PARTICULATE_KEYS,
  OVERNIGHT_KEYS, TREND_METRICS, INSIGHT_METRICS,
  PRIMARY_CORRELATIONS,
};
