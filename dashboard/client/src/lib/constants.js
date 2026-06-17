export const METRICS = {
  co2:         { label: 'CO2',       unit: 'ppm',    group: 'climate',     primary: true  },
  no2:         { label: 'NO2',       unit: 'ppm',    group: 'gas',         primary: true  },
  no2_rs:      { label: 'NO2 Rs',    unit: 'kΩ',    group: 'analog',      primary: false },
  no2_ratio:   { label: 'NO2 Ratio', unit: 'Rs/R0',  group: 'analog',      primary: false },
  sen0132_co:    { label: 'CO (SEN0132)', unit: 'ppm',   group: 'sen0132',     primary: false, noxious: true },
  sen0132_rs:    { label: 'CO Rs',        unit: 'kΩ',    group: 'sen0132',     primary: false },
  sen0132_ratio: { label: 'CO Rs/R0',     unit: 'Rs/R0', group: 'sen0132',     primary: false },
  pressure:      { label: 'Pressure',     unit: 'inHg',   group: 'climate',     primary: false },
  altitude:      { label: 'Altitude',     unit: 'm',     group: 'climate',     primary: false },
  bmp_temp:      { label: 'BMP Temp',     unit: '°C',    group: 'climate',     primary: false },
  pm1:         { label: 'PM1.0',     unit: 'µg/m³', group: 'particulate', primary: true  },
  pm2p5:       { label: 'PM2.5',     unit: 'µg/m³', group: 'particulate', primary: true  },
  pm4:         { label: 'PM4.0',     unit: 'µg/m³', group: 'particulate', primary: false },
  pm10:        { label: 'PM10',      unit: 'µg/m³', group: 'particulate', primary: false },
  o3:          { label: 'O3',        unit: 'ppb',    group: 'gas',         primary: true  },
  voc:         { label: 'VOC',       unit: 'index',  group: 'climate',     primary: true  },
  nox:         { label: 'NOx',       unit: 'index',  group: 'gas',         primary: false },
  temperature: { label: 'Temp',      unit: '°F',    group: 'climate',     primary: true  },
  humidity:    { label: 'Humidity',  unit: '%',      group: 'climate',     primary: true  },
  co:          { label: 'CO',        unit: 'ppm',    group: 'mics',        primary: false, noxious: true },
  c2h5oh:      { label: 'C₂H₅OH',  unit: 'ppm',    group: 'mics',        primary: false, noxious: true },
  ch4:         { label: 'CH4',       unit: 'ppm',    group: 'mics',        primary: false, noxious: true },
  h2:          { label: 'H2',        unit: 'ppm',    group: 'mics',        primary: false, noxious: true },
  nh3:         { label: 'NH3',       unit: 'ppm',    group: 'mics',        primary: false },
};

export const STATUS_COLORS = {
  good:     'text-mint',
  moderate: 'text-warn',
  poor:     'text-orange-400',
  alert:    'text-danger',
};

export const STATUS_DOT_COLORS = {
  good:     'bg-mint',
  moderate: 'bg-warn',
  poor:     'bg-orange-400',
  alert:    'bg-danger animate-pulse',
};

export const PRIMARY_METRICS     = ['co2', 'nox', 'o3', 'voc', 'temperature', 'humidity'];
export const PARTICULATE_METRICS = ['pm1', 'pm2p5', 'pm4', 'pm10'];
export const MICS_METRICS        = ['co', 'c2h5oh', 'ch4', 'h2', 'nh3'];
export const SEN0132_METRICS     = ['sen0132_rs', 'sen0132_ratio'];
export const BMP388_METRICS      = ['pressure', 'altitude'];
export const NOXIOUS_KEYS        = ['co', 'c2h5oh', 'ch4', 'h2', 'nox'];
export const TREND_METRICS       = ['co2', 'pm2p5', 'o3', 'no2', 'voc', 'temperature'];

export const SPIKE_THRESHOLDS = {
  co2: 1000, no2: 0.1, pm2p5: 25, o3: 70, voc: 250,
  co: 10, c2h5oh: 100, ch4: 500, h2: 200, nox: 0.3,
};

// Celsius → Fahrenheit (used only in display for temperature metrics)
export const cToF = c => Math.round((c * 9 / 5 + 32) * 10) / 10;

// hPa → Inches of Mercury (rounded to 2 decimal places for standard weather format)
export const hPaToInHg = hpa => Math.round((hpa / 33.8639) * 100) / 100;

// Main nav items — single source of truth for nav labels and icons
export const NAV_ITEMS = [
  { to: '/',        label: 'Now',       icon: '◉' },
  { to: '/daily',   label: 'Daily',     icon: '◈' },
  { to: '/night',   label: 'Overnight', icon: '◑' },
  { to: '/trends',  label: 'Trends',    icon: '◇' },
];

export const NAV_CONTEXT = Object.fromEntries(
  NAV_ITEMS.map(({ to, label, icon }) => [to, { label, icon }])
);

// Chemical symbols shown in the bottom nav when drilling into a metric
export const METRIC_NAV = {
  co2:         { icon: 'CO₂',  label: 'CO2'      },
  no2:         { icon: 'NO₂',  label: 'NO2'      },
  pm1:         { icon: 'PM₁',  label: 'PM1'      },
  pm2p5:       { icon: 'PM₂₅', label: 'PM2.5'    },
  pm4:         { icon: 'PM₄',  label: 'PM4'      },
  pm10:        { icon: 'PM₁₀', label: 'PM10'     },
  o3:          { icon: 'O₃',   label: 'O3'       },
  voc:         { icon: 'VOC',  label: 'VOC'      },
  nox:         { icon: 'NOₓ',  label: 'NOx'      },
  temperature: { icon: 'TMP',  label: 'Temp'     },
  humidity:    { icon: 'HUM',  label: 'Humidity' },
  co:          { icon: 'CO',   label: 'CO'       },
  c2h5oh:      { icon: 'EtOH', label: 'C₂H₅OH'  },
  ch4:         { icon: 'CH₄',  label: 'CH4'      },
  h2:          { icon: 'H₂',   label: 'H2'       },
  nh3:         { icon: 'NH₃',  label: 'NH3'           },
  no2_rs:      { icon: 'Rs',   label: 'NO2 Rs'        },
  no2_ratio:   { icon: 'Rρ',   label: 'NO2 ρ'         },
  sen0132_co:    { icon: 'CO',   label: 'CO (SEN0132)' },
  sen0132_rs:    { icon: 'Rs',   label: 'CO Rs'        },
  sen0132_ratio: { icon: 'Rρ',   label: 'CO ρ'         },
  pressure:      { icon: 'inHg',  label: 'Pressure'     },
  altitude:      { icon: 'ALT',  label: 'Altitude'     },
  bmp_temp:      { icon: 'BMP',  label: 'BMP Temp'     },
};
