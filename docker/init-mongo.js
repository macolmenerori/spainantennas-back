// SET UP MONGODB
// Switch to mongoDB admin database
db = db.getSiblingDB('admin');

// Create database admin with root privileges
db.createUser({
  user: 'admindb',
  pwd: 'admindb',
  roles: [{ role: 'root', db: 'admin' }]
});

// SET UP OPENSESAME
// Create opensesame database
db = db.getSiblingDB('opensesame');

// Create users collection
db.createCollection('users');

// Insert default user. user: admin@admin.com, password: administrator
db.users.insertOne({
  name: 'Admin',
  email: 'admin@admin.com',
  role: 'admin',
  password: '$2b$12$GhCoggnxkqF1WtU/KIxmjuouaMexO4cZBbkP8mzVWCnq56mqqcQfG',
  passwordChangedAt: new Date(),
  permissions: []
});

// SET UP SPAINANTENNAS
// Create spainantennas database
db = db.getSiblingDB('spainantennas');

// Create placements collection
db.createCollection('placements');

// Insert sample placements taken from the source data: AM-MW, FM, DAB+ and TV sites,
// including a TV site without coordinates (lat/lon null) and a DAB+ site without postcode.
// Transmitters are embedded subdocuments with their own _id, as Mongoose creates them.
db.placements.insertMany([
  {
    status: 'inactive',
    siteOperator: 'unknown',
    location: { lat: 40.4852, lon: -3.8744, altM: 732 },
    postcode: '28220',
    transmitters: [
      {
        _id: new ObjectId(),
        type: 'radio',
        technology: 'AM-MW',
        frequencykHz: 585,
        stationName: 'Radio Nacional',
        broadcaster: 'RTVE',
        powerKw: 600,
        source: 'BOE RD 765/1993; IberiaDX 2022; rne.es'
      },
      {
        _id: new ObjectId(),
        type: 'radio',
        technology: 'AM-MW',
        frequencykHz: 657,
        stationName: 'Radio 5',
        broadcaster: 'RTVE',
        powerKw: 100,
        source: 'BOE RD 765/1993; IberiaDX 2022; rne.es'
      }
    ],
    lastUpdate: new Date('2026-10-31T11:23:19Z'),
    source:
      'BOE RD 765/1993; IberiaDX 2022; RTVE 2025-11-18; OSM Nominatim; Open-Meteo; en.wikipedia; coord confidence: high'
  },
  {
    status: 'active',
    siteOperator: 'unknown',
    location: { lat: 41.35083, lon: 2.00139, altM: 217 },
    postcode: '08849',
    transmitters: [
      {
        _id: new ObjectId(),
        type: 'radio',
        technology: 'AM-MW',
        frequencykHz: 666,
        stationName: 'Radio Barcelona',
        broadcaster: 'Cadena SER (Unión Radio/PRISA)',
        powerKw: 50,
        source:
          "BDXC Europe on Mediumwave 26 Oct 2026 (Winter 2026/27 v1) lists SER Radio Barcelona 666 as remaining, 50 kW nominal, 'reportedly 1 kW at present'; power per BDXC 2026/radioescuchante 2017/gorkazumeta"
      }
    ],
    lastUpdate: new Date('2026-11-02T00:00:00Z'),
    source:
      "Ministerio Transformación Digital OM local list (emisorasomambitolocal.xlsx, official coords); ministry site name BARCELONA; status basis: BDXC Europe on Mediumwave 26 Oct 2026 (Winter 2026/27 v1) lists SER Radio Barcelona 666 as remaining, 50 kW nominal, 'reportedly 1 kW at present'; OSM Nominatim; Open-Meteo; coord confidence: high"
  },
  {
    status: 'unknown',
    siteOperator: 'unknown',
    location: { lat: 41.63222, lon: -0.91639, altM: 246 },
    postcode: '50012',
    transmitters: [
      {
        _id: new ObjectId(),
        type: 'radio',
        technology: 'AM-MW',
        frequencykHz: 873,
        stationName: 'Radio Zaragoza',
        broadcaster: 'Cadena SER',
        powerKw: 10,
        source:
          'https://digital.gob.es OM local list (emisorasomambitolocal.xlsx, licence coords ETRS89); not in hispaniaam 2026 directory; on-air not confirmed'
      }
    ],
    lastUpdate: new Date('2026-11-02T00:00:00Z'),
    source:
      "not in hispaniaam 2026 directory; on-air not confirmed. Coordinates from https://digital.gob.es OM local list (emisorasomambitolocal.xlsx, licence coords ETRS89) (station 'ZARAGOZA', 873 kHz); power from radioescuchante.blogspot.com 2017 (unverified); OSM Nominatim; Open-Meteo; coord confidence: high"
  },
  {
    status: 'active',
    siteOperator: 'unknown',
    location: { lat: 40.4558, lon: -3.6911, altM: 708 },
    postcode: '28020',
    transmitters: [
      {
        _id: new ObjectId(),
        type: 'radio',
        technology: 'FM',
        frequencykHz: 88200,
        stationName: 'Radio Nacional',
        broadcaster: 'RTVE',
        powerKw: 50,
        source:
          "Ministry digital.gob.es EmisorasFMdeRadioNacionaldeEspana.xlsx (frequency, ERP; no coordinates); rtve.es/radio/frecuencias-rne/ (accessed 2026-11-03, listed under 'TORRESPAÑA' for Radio Nacional)"
      },
      {
        _id: new ObjectId(),
        type: 'radio',
        technology: 'FM',
        frequencykHz: 90300,
        stationName: 'Radio 5',
        broadcaster: 'RTVE',
        powerKw: 50,
        source:
          "Ministry digital.gob.es EmisorasFMdeRadioNacionaldeEspana.xlsx (frequency, ERP; no coordinates); rtve.es/radio/frecuencias-rne/ (accessed 2026-11-03, listed under 'TORRESPAÑA' for Radio 5)"
      },
      {
        _id: new ObjectId(),
        type: 'radio',
        technology: 'FM',
        frequencykHz: 93200,
        stationName: 'Radio 3',
        broadcaster: 'RTVE',
        powerKw: 50,
        source:
          "Ministry digital.gob.es EmisorasFMdeRadioNacionaldeEspana.xlsx (frequency, ERP; no coordinates); rtve.es/radio/frecuencias-rne/ (accessed 2026-11-03, listed under 'TORRESPAÑA' for Radio 3)"
      },
      {
        _id: new ObjectId(),
        type: 'radio',
        technology: 'FM',
        frequencykHz: 96500,
        stationName: 'Radio Clásica',
        broadcaster: 'RTVE',
        powerKw: 50,
        source:
          "Ministry digital.gob.es EmisorasFMdeRadioNacionaldeEspana.xlsx (frequency, ERP; no coordinates); rtve.es/radio/frecuencias-rne/ (accessed 2026-11-03, listed under 'TORRESPAÑA' for Radio Clásica)"
      }
    ],
    lastUpdate: new Date('2026-11-03T12:00:00Z'),
    source:
      "Ministry RNE FM list (station 'MADRID TORRESPAÑA', Madrid (Comunidad de)); rtve.es/radio/frecuencias-rne/ 2026-11-03 (locality 'TORRESPAÑA') confirms on current RNE list; coords from municipality/locality centroid via Photon (OSM) geocode 'Torrespaña (known landmark)', not the transmitter mast; Open-Meteo elevation; postcode OSM Photon reverse geocode (Nominatim returned HTTP 429); powerKw = max of Ministry p.r.a. H/V; coord confidence: high"
  },
  {
    status: 'active',
    siteOperator: 'unknown',
    location: { lat: 39.7366, lon: 2.71701, altM: 990 },
    postcode: '07100',
    transmitters: [
      {
        _id: new ObjectId(),
        type: 'radio',
        technology: 'FM',
        frequencykHz: 87900,
        stationName: 'Radio Clásica',
        broadcaster: 'RTVE',
        powerKw: 50,
        source:
          'Ministry (MTDFP/digital.gob.es) list EmisorasFMdeRadioNacionaldeEspana.pdf, Wayback snapshot 2024; power = p.r.a. horizontal listed; network+status: rtve.es/radio/frecuencias-rne (2026-11-03), locality ALFABIA (MALLORCA)'
      },
      {
        _id: new ObjectId(),
        type: 'radio',
        technology: 'FM',
        frequencykHz: 90100,
        stationName: 'Radio Nacional',
        broadcaster: 'RTVE',
        powerKw: 50,
        source:
          'Ministry (MTDFP/digital.gob.es) list EmisorasFMdeRadioNacionaldeEspana.pdf, Wayback snapshot 2024; power = p.r.a. horizontal listed; network+status: rtve.es/radio/frecuencias-rne (2026-11-03), locality ALFABIA (MALLORCA)'
      },
      {
        _id: new ObjectId(),
        type: 'radio',
        technology: 'FM',
        frequencykHz: 92300,
        stationName: 'Radio 3',
        broadcaster: 'RTVE',
        powerKw: 50,
        source:
          'Ministry (MTDFP/digital.gob.es) list EmisorasFMdeRadioNacionaldeEspana.pdf, Wayback snapshot 2024; power = p.r.a. horizontal listed; network+status: rtve.es/radio/frecuencias-rne (2026-11-03), locality ALFABIA (MALLORCA)'
      },
      {
        _id: new ObjectId(),
        type: 'radio',
        technology: 'FM',
        frequencykHz: 104500,
        stationName: 'Radio 5',
        broadcaster: 'RTVE',
        powerKw: 50,
        source:
          'Ministry (MTDFP/digital.gob.es) list EmisorasFMdeRadioNacionaldeEspana.pdf, Wayback snapshot 2024; power = p.r.a. horizontal listed; network+status: rtve.es/radio/frecuencias-rne (2026-11-03), locality ALFABIA (MALLORCA)'
      }
    ],
    lastUpdate: new Date('2026-11-03T11:12:19Z'),
    source:
      "Ministry (digital.gob.es) RNE FM station list, Wayback 2024 snapshot of avance.digital.gob.es PDF; Ministry site name 'ALFABIA' (Balears (Illes)); status unknown: list is a licence/station list without network names and not confirmed against current rne.es 2026 frequency list (rne.es unreachable: TLS cert error); coordinates: Alfabia, Mallorca approximate; Open-Meteo elevation; postcode unavailable; coord confidence: medium; status active: >=1 frequency on current rtve.es list (2026-11-03); coordinates refined (1.6 km from previous point): OSM node/1089041036 man_made=communications_tower; cluster of comms towers (1089041060, 6018071041, 1089040801) on Puig de s'Aritjar, Serra d'Alfabia"
  },
  {
    status: 'active',
    siteOperator: 'unknown',
    location: { lat: 37.2685, lon: -4.86522, altM: 838 },
    postcode: '41560',
    transmitters: [
      {
        _id: new ObjectId(),
        type: 'radio',
        technology: 'FM',
        frequencykHz: 90400,
        stationName: 'Canal Fiesta Radio',
        broadcaster: 'RTVA (Canal Sur)',
        powerKw: 0.5,
        source:
          'Ministry FM list (autonomico) https://digital.gob.es/content/dam/portal-mtdfp/avance-digital/telecomunicacion-e-infraestructuras-digitales/areas_interes/espectro-radioelectrico/radiodifusion-fm/fmautonomico/EmisorasFMautonomicasdeAndalucia.xlsx: Sevilla / BECERRERO 90.4 MHz, ERP max H/V; regional public broadcaster per Ministry list; network: Canal Fiesta Radio per https://www.canalsur.es/radio/frecuencias-canal-sur-radio/ (current-official, fetched 2026-11-03; match freq+province (unique in province, locality differs; distance not checked))'
      },
      {
        _id: new ObjectId(),
        type: 'radio',
        technology: 'FM',
        frequencykHz: 94100,
        stationName: 'Canal Sur Radio',
        broadcaster: 'RTVA (Canal Sur)',
        powerKw: 0.5,
        source:
          'Ministry FM list (autonomico) https://digital.gob.es/content/dam/portal-mtdfp/avance-digital/telecomunicacion-e-infraestructuras-digitales/areas_interes/espectro-radioelectrico/radiodifusion-fm/fmautonomico/EmisorasFMautonomicasdeAndalucia.xlsx: Sevilla / BECERRERO 94.1 MHz, ERP max H/V; regional public broadcaster per Ministry list; network: Canal Sur Radio per https://www.canalsur.es/radio/frecuencias-canal-sur-radio/ (current-official, fetched 2026-11-03; match freq+province (unique in province, locality differs; distance not checked))'
      },
      {
        _id: new ObjectId(),
        type: 'radio',
        technology: 'FM',
        frequencykHz: 99200,
        stationName: 'Radio Andalucía Información',
        broadcaster: 'RTVA (Canal Sur)',
        powerKw: 0.5,
        source:
          'Ministry FM list (autonomico) https://digital.gob.es/content/dam/portal-mtdfp/avance-digital/telecomunicacion-e-infraestructuras-digitales/areas_interes/espectro-radioelectrico/radiodifusion-fm/fmautonomico/EmisorasFMautonomicasdeAndalucia.xlsx: Sevilla / BECERRERO 99.2 MHz, ERP max H/V; regional public broadcaster per Ministry list; network: Radio Andalucía Información per https://www.canalsur.es/radio/frecuencias-canal-sur-radio/ (current-official, fetched 2026-11-03; match freq+province (unique in province, locality differs; distance not checked))'
      }
    ],
    lastUpdate: new Date('2026-11-03T20:19:21Z'),
    source:
      "Ministry FM list (autonomico) https://digital.gob.es/content/dam/portal-mtdfp/avance-digital/telecomunicacion-e-infraestructuras-digitales/areas_interes/espectro-radioelectrico/radiodifusion-fm/fmautonomico/EmisorasFMautonomicasdeAndalucia.xlsx: site 'BECERRERO' (Sevilla); Ministry list gives no coordinates for regional public stations; position from OSM Nominatim search 'Becerrero, Sevilla' (natural/mountain_range); coord confidence: low (OSM peak/hill matched by name; mast position on it not verified); digital.gob.es FM lists (Ministerio para la Transformación Digital): fm-local, fm-autonomico, fm-municipal; licence lists, not on-air logs, undated; altM: Open-Meteo elevation API; postcode: OSM Nominatim search result address"
  },
  {
    status: 'active',
    siteOperator: 'unknown',
    location: { lat: 41.42167, lon: 2.1184, altM: 478 },
    postcode: '08017',
    transmitters: [
      {
        _id: new ObjectId(),
        type: 'radio',
        technology: 'FM',
        frequencykHz: 90500,
        stationName: 'Los40 Classic',
        broadcaster: 'PRISA Radio',
        powerKw: 4,
        source:
          'Ministry FM list (local) https://digital.gob.es/content/dam/portal-mtdfp/avance-digital/telecomunicacion-e-infraestructuras-digitales/areas_interes/espectro-radioelectrico/radiodifusion-fm/fmlocal/EmisorasFM-local-Cataluna.xls: Barcelona / BARCELONA 90.5 MHz, ERP max H/V; network: Los40 Classic per https://guiadelaradio.com/emisoras-barcelona (dated-2026, fetched 2026-11-03; match freq+locality+province)'
      },
      {
        _id: new ObjectId(),
        type: 'radio',
        technology: 'FM',
        frequencykHz: 93900,
        stationName: 'Los40 (Los 40 Barcelona)',
        broadcaster: 'PRISA Radio',
        powerKw: 4,
        source:
          'Ministry FM list (local) https://digital.gob.es/content/dam/portal-mtdfp/avance-digital/telecomunicacion-e-infraestructuras-digitales/areas_interes/espectro-radioelectrico/radiodifusion-fm/fmlocal/EmisorasFM-local-Cataluna.xls: Barcelona / BARCELONA 93.9 MHz, ERP max H/V; network: Los40 per https://guiadelaradio.com/emisoras-barcelona (dated-2026, fetched 2026-11-03; match freq+locality+province)'
      },
      {
        _id: new ObjectId(),
        type: 'radio',
        technology: 'FM',
        frequencykHz: 96900,
        stationName: 'Cadena SER (Ràdio Barcelona)',
        broadcaster: 'PRISA Radio',
        powerKw: 4,
        source:
          'Ministry FM list (local) https://digital.gob.es/content/dam/portal-mtdfp/avance-digital/telecomunicacion-e-infraestructuras-digitales/areas_interes/espectro-radioelectrico/radiodifusion-fm/fmlocal/EmisorasFM-local-Cataluna.xls: Barcelona / BARCELONA 96.9 MHz, ERP max H/V; network: Cadena SER per https://guiadelaradio.com/emisoras-barcelona (dated-2026, fetched 2026-11-03; match freq+locality+province)'
      },
      {
        _id: new ObjectId(),
        type: 'radio',
        technology: 'FM',
        frequencykHz: 99400,
        stationName: 'Cadena Dial (Barcelona)',
        broadcaster: 'PRISA Radio',
        powerKw: 4,
        source:
          'Ministry FM list (local) https://digital.gob.es/content/dam/portal-mtdfp/avance-digital/telecomunicacion-e-infraestructuras-digitales/areas_interes/espectro-radioelectrico/radiodifusion-fm/fmlocal/EmisorasFM-local-Cataluna.xls: Barcelona / BARCELONA 99.4 MHz, ERP max H/V; network: Cadena Dial per https://www.cadenadial.com/emisoras (current-official, fetched 2026-11-03; match freq+locality+province)'
      }
    ],
    lastUpdate: new Date('2026-11-03T20:19:21Z'),
    source:
      'Ministry FM lists (local) on digital.gob.es, Ministry localities: BARCELONA (Barcelona); digital.gob.es FM lists (Ministerio para la Transformación Digital): fm-local, fm-autonomico, fm-municipal; licence lists, not on-air logs, undated; coordinates from Ministry list (ETRS89 DMS), mean of 4 rows within 17 m; coord confidence: high; status rule: active if a transmitter is on a network/station page fetched 2026-11-03 or a 2026-dated source; altM: Ministry Cota; postcode: OSM Nominatim reverse geocode'
  },
  {
    status: 'unknown',
    siteOperator: 'unknown',
    location: { lat: 36.66306, lon: -4.56056, altM: 91 },
    postcode: '29130',
    transmitters: [
      {
        _id: new ObjectId(),
        type: 'radio',
        technology: 'FM',
        frequencykHz: 102100,
        stationName: 'unknown',
        broadcaster: 'Ayuntamiento de Alhaurin Torre',
        powerKw: 0.075,
        source:
          'Ministry FM list (municipal) https://digital.gob.es/content/dam/portal-mtdfp/avance-digital/telecomunicacion-e-infraestructuras-digitales/areas_interes/espectro-radioelectrico/radiodifusion-fm/fmmunicipal/emisorasfmmunicipalesdeandalucia.xls: Málaga / ALHAURIN TORRE 102.1 MHz, ERP max H/V; municipal licence holder per Ministry list; status unknown: no 2026 on-air evidence found'
      }
    ],
    lastUpdate: new Date('2026-11-03T20:19:21Z'),
    source:
      'Ministry FM lists (municipal) on digital.gob.es, Ministry localities: ALHAURIN TORRE (Málaga); digital.gob.es FM lists (Ministerio para la Transformación Digital): fm-local, fm-autonomico, fm-municipal; licence lists, not on-air logs, undated; coordinates from Ministry list (ETRS89 DMS); coord confidence: high; status rule: active if a transmitter is on a network/station page fetched 2026-11-03 or a 2026-dated source; altM: Ministry Cota; postcode: OSM Nominatim reverse geocode'
  },
  {
    status: 'inactive',
    siteOperator: 'unknown',
    location: { lat: 28.17917, lon: -16.4575, altM: 234 },
    postcode: '38589',
    transmitters: [
      {
        _id: new ObjectId(),
        type: 'radio',
        technology: 'FM',
        frequencykHz: 100300,
        stationName: 'Canal 4 Tenerife (esRadio)',
        broadcaster: 'unknown',
        powerKw: 0.244,
        source:
          "Ministry FM list (local) https://digital.gob.es/content/dam/portal-mtdfp/avance-digital/telecomunicacion-e-infraestructuras-digitales/areas_interes/espectro-radioelectrico/radiodifusion-fm/fmlocal/EmisorasFM-local-Canarias.xls: Santa Cruz de Tenerife / ARICO 100.3 MHz, ERP max H/V; station: Canal 4 Tenerife (esRadio) per https://www.fmlist.org/es_2b.php?smode1=C&MHz=100.3&MHz2=100.3 (closed, dated 2026-08-20); AER/FMLIST España en FM record Arico/Arico Viejo 'Comercial-Inactiva, Inac (8/26)'."
      }
    ],
    lastUpdate: new Date('2026-11-03T20:19:21Z'),
    source:
      'Ministry FM lists (local) on digital.gob.es, Ministry localities: ARICO (Santa Cruz de Tenerife); digital.gob.es FM lists (Ministerio para la Transformación Digital): fm-local, fm-autonomico, fm-municipal; licence lists, not on-air logs, undated; coordinates from Ministry list (ETRS89 DMS); coord confidence: high; status rule: active if a transmitter is on a network/station page fetched 2026-11-03 or a 2026-dated source; altM: Ministry Cota; postcode: OSM Nominatim reverse geocode'
  },
  {
    status: 'unknown',
    siteOperator: 'Cellnex Telecom',
    location: { lat: 40.41678, lon: -3.70351, altM: 666 },
    postcode: '28013',
    transmitters: [
      {
        _id: new ObjectId(),
        type: 'radio',
        technology: 'DAB+',
        frequencykHz: null,
        stationName: 'RNE DAB+ (block not stated): Radio Nacional, Radio Clásica, Radio 3, Radio 5',
        broadcaster: 'RNE (RTVE)',
        powerKw: null,
        source:
          'https://www.worlddab.org/countries/spain (fetched 2026-11-04); launch 2024-02-13; block/frequency and power not stated in any source'
      }
    ],
    lastUpdate: new Date('2026-11-04T12:00:00Z'),
    source:
      "https://www.worlddab.org/countries/spain (fetched 2026-11-04); location as stated: city only; coord confidence: low (Nominatim administrative point 'Madrid (RNE DAB+)', not mast); status unknown: city-level launch news 2024-2025, no on-air check 2026"
  },
  {
    status: 'unknown',
    siteOperator: 'Cellnex Telecom',
    location: { lat: 28.30725, lon: -16.50214, altM: 2373 },
    postcode: null,
    transmitters: [
      {
        _id: new ObjectId(),
        type: 'radio',
        technology: 'DAB+',
        frequencykHz: null,
        stationName: 'RNE DAB+ (block not stated): Radio Nacional, Radio 3, Radio 5',
        broadcaster: 'RNE (RTVE)',
        powerKw: null,
        source:
          'https://www.worlddab.org/newsroom/14208 (fetched 2026-11-04); launch 2024-05-17; block/frequency and power not stated in any source'
      }
    ],
    lastUpdate: new Date('2026-11-04T12:00:00Z'),
    source:
      "https://www.worlddab.org/newsroom/14208 (fetched 2026-11-04); location as stated: Izaña broadcasting centre; coord confidence: medium (Nominatim peak point 'Izaña', not mast); status unknown: city-level launch news 2024-2025, no on-air check 2026"
  },
  {
    status: 'active',
    siteOperator: 'Cellnex Telecom',
    location: { lat: 39.71608, lon: 2.69278, altM: 257 },
    postcode: '07110',
    transmitters: [
      {
        _id: new ObjectId(),
        type: 'radio',
        technology: 'DAB+',
        frequencykHz: null,
        stationName: 'RNE DAB+ (block not stated): Radio Nacional, Radio Clásica, Radio 3, Radio 5',
        broadcaster: 'RNE (RTVE)',
        powerKw: null,
        source:
          'https://www.worlddab.org/newsroom/14351 (fetched 2026-11-04); launch 2024-07-18; block/frequency and power not stated in any source'
      },
      {
        _id: new ObjectId(),
        type: 'radio',
        technology: 'DAB+',
        frequencykHz: null,
        stationName:
          'IB3/IB Digital regional DAB+ network (block not stated): IB3 Ràdio (others not listed)',
        broadcaster: 'IB3 Ràdio / IB Digital (Govern balear)',
        powerKw: null,
        source:
          'https://www.worlddab.org/newsroom/17833 (fetched 2026-11-04); launch 2026-05-05; block/frequency and power not stated in any source'
      }
    ],
    lastUpdate: new Date('2026-11-04T12:00:00Z'),
    source:
      "https://www.worlddab.org/newsroom/14351 (fetched 2026-11-04); location as stated: Alfàbia; coord confidence: low (Nominatim garden point 'Alfàbia (RNE)', not mast); status unknown: city-level launch news 2024-2025, no on-air check 2026 | merged Alfàbia (IB3)"
  },
  {
    status: 'active',
    siteOperator: 'unknown',
    location: { lat: 40.33667, lon: -3.23556, altM: 677 },
    postcode: '28512',
    transmitters: [
      {
        _id: new ObjectId(),
        type: 'TV',
        technology: 'TDT',
        frequencykHz: 610000,
        stationName: 'Telemadrid HDR',
        broadcaster: 'Radio Televisión Madrid',
        powerKw: 0.016,
        source:
          'Mux MAUT-MAD, UHF ch 38 (610 MHz). Transmitter from Ministry station list "Múltiple Digital de cobertura autonómica" (digital.gob.es, sheet extension of coverage by public initiative), centre "VILLAR OLMO", p.r.a. 0,016 kW pol H; channel list of the mux from muxtdt.com (fetched 2026-11-04) assumed identical at every transmitter of the mux'
      },
      {
        _id: new ObjectId(),
        type: 'TV',
        technology: 'TDT',
        frequencykHz: 610000,
        stationName: 'BOM',
        broadcaster: 'unknown (not stated by source)',
        powerKw: 0.016,
        source:
          'Mux MAUT-MAD, UHF ch 38 (610 MHz). Transmitter from Ministry station list "Múltiple Digital de cobertura autonómica" (digital.gob.es, sheet extension of coverage by public initiative), centre "VILLAR OLMO", p.r.a. 0,016 kW pol H; channel list of the mux from muxtdt.com (fetched 2026-11-04) assumed identical at every transmitter of the mux'
      },
      {
        _id: new ObjectId(),
        type: 'TV',
        technology: 'TDT',
        frequencykHz: 610000,
        stationName: 'Telemadrid',
        broadcaster: 'Radio Televisión Madrid',
        powerKw: 0.016,
        source:
          'Mux MAUT-MAD, UHF ch 38 (610 MHz). Transmitter from Ministry station list "Múltiple Digital de cobertura autonómica" (digital.gob.es, sheet extension of coverage by public initiative), centre "VILLAR OLMO", p.r.a. 0,016 kW pol H; channel list of the mux from muxtdt.com (fetched 2026-11-04) assumed identical at every transmitter of the mux'
      },
      {
        _id: new ObjectId(),
        type: 'TV',
        technology: 'TDT',
        frequencykHz: 610000,
        stationName: 'La Otra',
        broadcaster: 'Radio Televisión Madrid',
        powerKw: 0.016,
        source:
          'Mux MAUT-MAD, UHF ch 38 (610 MHz). Transmitter from Ministry station list "Múltiple Digital de cobertura autonómica" (digital.gob.es, sheet extension of coverage by public initiative), centre "VILLAR OLMO", p.r.a. 0,016 kW pol H; channel list of the mux from muxtdt.com (fetched 2026-11-04) assumed identical at every transmitter of the mux'
      },
      {
        _id: new ObjectId(),
        type: 'TV',
        technology: 'TDT',
        frequencykHz: 570000,
        stationName: 'Clan',
        broadcaster: 'RTVE',
        powerKw: 0.112,
        source:
          'Mux RGE1-MAD, UHF ch 33 (570 MHz). Transmitter from Ministry station list "Red Global de cobertura Estatal 1" (digital.gob.es, sheet extension of coverage by public initiative), centre "VILLAR OLMO2", p.r.a. 0,112 kW pol H; channel list of the mux from muxtdt.com (fetched 2026-11-04) assumed identical at every transmitter of the mux'
      },
      {
        _id: new ObjectId(),
        type: 'TV',
        technology: 'TDT',
        frequencykHz: 570000,
        stationName: 'Teledeporte',
        broadcaster: 'RTVE',
        powerKw: 0.112,
        source:
          'Mux RGE1-MAD, UHF ch 33 (570 MHz). Transmitter from Ministry station list "Red Global de cobertura Estatal 1" (digital.gob.es, sheet extension of coverage by public initiative), centre "VILLAR OLMO2", p.r.a. 0,112 kW pol H; channel list of the mux from muxtdt.com (fetched 2026-11-04) assumed identical at every transmitter of the mux'
      },
      {
        _id: new ObjectId(),
        type: 'TV',
        technology: 'TDT',
        frequencykHz: 570000,
        stationName: '24 Horas',
        broadcaster: 'RTVE',
        powerKw: 0.112,
        source:
          'Mux RGE1-MAD, UHF ch 33 (570 MHz). Transmitter from Ministry station list "Red Global de cobertura Estatal 1" (digital.gob.es, sheet extension of coverage by public initiative), centre "VILLAR OLMO2", p.r.a. 0,112 kW pol H; channel list of the mux from muxtdt.com (fetched 2026-11-04) assumed identical at every transmitter of the mux'
      },
      {
        _id: new ObjectId(),
        type: 'TV',
        technology: 'TDT',
        frequencykHz: 570000,
        stationName: 'La 1',
        broadcaster: 'RTVE',
        powerKw: 0.112,
        source:
          'Mux RGE1-MAD, UHF ch 33 (570 MHz). Transmitter from Ministry station list "Red Global de cobertura Estatal 1" (digital.gob.es, sheet extension of coverage by public initiative), centre "VILLAR OLMO2", p.r.a. 0,112 kW pol H; channel list of the mux from muxtdt.com (fetched 2026-11-04) assumed identical at every transmitter of the mux'
      },
      {
        _id: new ObjectId(),
        type: 'TV',
        technology: 'TDT',
        frequencykHz: 570000,
        stationName: 'La 2',
        broadcaster: 'RTVE',
        powerKw: 0.112,
        source:
          'Mux RGE1-MAD, UHF ch 33 (570 MHz). Transmitter from Ministry station list "Red Global de cobertura Estatal 1" (digital.gob.es, sheet extension of coverage by public initiative), centre "VILLAR OLMO2", p.r.a. 0,112 kW pol H; channel list of the mux from muxtdt.com (fetched 2026-11-04) assumed identical at every transmitter of the mux'
      }
    ],
    lastUpdate: new Date('2026-11-04T12:00:00Z'),
    source:
      'Site "VILLAR OLMO, VILLAR OLMO2" (Madrid). Ministry names: VILLAR OLMO, VILLAR OLMO2. status active: vivirediciones.es 2026-10-03: repeater deployed in Villar del Olmo (casco histórico). coord confidence: low; coordinates: es.wikipedia.org municipality/locality "Villar del Olmo" centroid, matched by name to Ministry centre "VILLAR OLMO". Not a surveyed mast position. siteOperator unknown: only appears in the "extension of coverage by public initiative" sheets, so operator not assumed. Sources: Ministry (Ministerio para la Transformación Digital) lists "Múltiple Privado de cobertura Estatal 1-5", "Red Global de cobertura Estatal 1-2" and regional "Múltiple Digital de cobertura autonómica" ODS files, digital.gob.es, fetched 2026-11-04; services per mux from muxtdt.com; altM and postcode not available (no API calls made) Channel-owner names (broadcaster) in this site come from general knowledge/muxtdt, not a fetched owner source.'
  },
  {
    status: 'active',
    siteOperator: 'Principado de Asturias (Servicio de Telecomunicaciones)',
    location: { lat: 43.528253, lon: -7.064653, altM: 179 },
    postcode: '27797',
    transmitters: [
      {
        _id: new ObjectId(),
        type: 'TV',
        technology: 'TDT',
        frequencykHz: 618000,
        stationName: 'La 1',
        broadcaster: 'RTVE',
        powerKw: null,
        source:
          "Multiplex RGE1, UHF ch 39; Principado de Asturias 'Centros y canales por centro 2026' (19/02/2026): cell for this centre run by Principado de Asturias"
      },
      {
        _id: new ObjectId(),
        type: 'TV',
        technology: 'TDT',
        frequencykHz: 618000,
        stationName: 'La 2',
        broadcaster: 'RTVE',
        powerKw: null,
        source:
          "Multiplex RGE1, UHF ch 39; Principado de Asturias 'Centros y canales por centro 2026' (19/02/2026): cell for this centre run by Principado de Asturias"
      },
      {
        _id: new ObjectId(),
        type: 'TV',
        technology: 'TDT',
        frequencykHz: 618000,
        stationName: 'Teledeporte',
        broadcaster: 'RTVE',
        powerKw: null,
        source:
          "Multiplex RGE1, UHF ch 39; Principado de Asturias 'Centros y canales por centro 2026' (19/02/2026): cell for this centre run by Principado de Asturias"
      },
      {
        _id: new ObjectId(),
        type: 'TV',
        technology: 'TDT',
        frequencykHz: 618000,
        stationName: '24H',
        broadcaster: 'RTVE',
        powerKw: null,
        source:
          "Multiplex RGE1, UHF ch 39; Principado de Asturias 'Centros y canales por centro 2026' (19/02/2026): cell for this centre run by Principado de Asturias"
      },
      {
        _id: new ObjectId(),
        type: 'TV',
        technology: 'TDT',
        frequencykHz: 666000,
        stationName: 'TPA 7',
        broadcaster: 'RTPA',
        powerKw: null,
        source:
          "Multiplex MAUT-AST, UHF ch 45; Principado de Asturias 'Centros y canales por centro 2026' (19/02/2026): cell for this centre run by Principado de Asturias"
      },
      {
        _id: new ObjectId(),
        type: 'TV',
        technology: 'TDT',
        frequencykHz: 666000,
        stationName: 'TPA 8',
        broadcaster: 'RTPA',
        powerKw: null,
        source:
          "Multiplex MAUT-AST, UHF ch 45; Principado de Asturias 'Centros y canales por centro 2026' (19/02/2026): cell for this centre run by Principado de Asturias"
      }
    ],
    lastUpdate: new Date('2026-11-04T12:00:00Z'),
    source:
      "Site: Valín, El (concejo Lugo). Principado de Asturias, Servicio de Telecomunicaciones, PDF 'Centros y canales por centro-2026' dated 19/02/2026 (asturias.es/documents/4911212/4919726/Centros+y+canales+por+centro-2026.pdf; page asturias.es 'tdt-difusion-adecuacion-4g-5g'): government list, not an on-air log, so status 'active' means the channels are listed as in service in Feb-2026 (blank cells = sin servicio, not listed). Operator per PDF column OPERADOR: PRINCIPADO. Coordinates: DMS ETRS89 from the PDF, coord confidence: high; altM = PDF 'COTA' (ground elevation). Channel numbers are the region-wide assignment in the PDF legend. MPE5 HD channels announced to cease on 5 Nov 2026 (BOE 2026-07-23)."
  },
  {
    status: 'unknown',
    siteOperator: 'unknown',
    location: { lat: 40.33333, lon: -3.86667, altM: 654 },
    postcode: '28933',
    transmitters: [
      {
        _id: new ObjectId(),
        type: 'TV',
        technology: 'TDT',
        frequencykHz: 546000,
        stationName: '8madrid TV',
        broadcaster: 'unknown (not stated by source)',
        powerKw: 2,
        source:
          'Local multiplex TL08M, UHF ch 30 (546 MHz) ; services per muxtdt.com demarcation page (fetched 2026-11-04); power = max p.r.a. of the demarcation in the Ministry PDF, not measured'
      },
      {
        _id: new ObjectId(),
        type: 'TV',
        technology: 'TDT',
        frequencykHz: 546000,
        stationName: 'TRECE',
        broadcaster: 'unknown (not stated by source)',
        powerKw: 2,
        source:
          'Local multiplex TL08M, UHF ch 30 (546 MHz) ; services per muxtdt.com demarcation page (fetched 2026-11-04); power = max p.r.a. of the demarcation in the Ministry PDF, not measured'
      },
      {
        _id: new ObjectId(),
        type: 'TV',
        technology: 'TDT',
        frequencykHz: 546000,
        stationName: 'DISTRITO TV',
        broadcaster: 'unknown (not stated by source)',
        powerKw: 2,
        source:
          'Local multiplex TL08M, UHF ch 30 (546 MHz) ; services per muxtdt.com demarcation page (fetched 2026-11-04); power = max p.r.a. of the demarcation in the Ministry PDF, not measured'
      },
      {
        _id: new ObjectId(),
        type: 'TV',
        technology: 'TDT',
        frequencykHz: 546000,
        stationName: 'TBN',
        broadcaster: 'unknown (not stated by source)',
        powerKw: 2,
        source:
          'Local multiplex TL08M, UHF ch 30 (546 MHz) ; services per muxtdt.com demarcation page (fetched 2026-11-04); power = max p.r.a. of the demarcation in the Ministry PDF, not measured'
      },
      {
        _id: new ObjectId(),
        type: 'TV',
        technology: 'TDT',
        frequencykHz: 546000,
        stationName: 'Canal Galería',
        broadcaster: 'unknown (not stated by source)',
        powerKw: 2,
        source:
          'Local multiplex TL08M, UHF ch 30 (546 MHz) ; services per muxtdt.com demarcation page (fetched 2026-11-04); power = max p.r.a. of the demarcation in the Ministry PDF, not measured'
      }
    ],
    lastUpdate: new Date('2026-11-04T12:00:00Z'),
    source:
      'Site: local TDT demarcation TL08M "MOSTOLES" (Madrid), coverage: Móstoles, Leganés, Alcorcón, Navalcarnero, Humanes de Madrid, Arroyomolinos, y Moraleja de Enmedio.. status active: muxtdt.com (fetched 2026-11-04, page (c) 2026) lists TV services on this local multiplex; it is a theoretical-coverage guide, not an on-air log. coord confidence: low; coordinates: es.wikipedia.org municipality "Móstoles" centroid; this is the demarcation head town, the real local transmitter site is NOT known. siteOperator unknown: the local transmitter operator is not stated by any source. Sources: Ministry local-TV demarcation PDF (digital.gob.es, fetched 2026-11-04), muxtdt.com. altM and postcode not available | Downgraded to unknown: only muxtdt (aggregator, not on-air log) confirmed it. Channel-owner names (broadcaster) in this site come from general knowledge/muxtdt, not a fetched owner source.'
  },
  {
    status: 'active',
    siteOperator: 'CARM / Ayuntamiento de Cartagena',
    location: { lat: null, lon: null, altM: null },
    postcode: null,
    transmitters: [
      {
        _id: new ObjectId(),
        type: 'TV',
        technology: 'TDT',
        frequencykHz: null,
        stationName: 'Popular TV',
        broadcaster: 'unknown',
        powerKw: null,
        source:
          'MAUT (channel number not given in source); tdtrm.es/centros.jsp (CARM Murcia government TDT site, fetched 2026-11-04; lists centres and multiplexes, no coordinates or channel numbers); channel content taken from muxtdt Murcia page (same multiplex content region-wide)'
      },
      {
        _id: new ObjectId(),
        type: 'TV',
        technology: 'TDT',
        frequencykHz: null,
        stationName: '7RM',
        broadcaster: 'unknown',
        powerKw: null,
        source:
          'MAUT (channel number not given in source); tdtrm.es/centros.jsp (CARM Murcia government TDT site, fetched 2026-11-04; lists centres and multiplexes, no coordinates or channel numbers); channel content taken from muxtdt Murcia page (same multiplex content region-wide)'
      },
      {
        _id: new ObjectId(),
        type: 'TV',
        technology: 'TDT',
        frequencykHz: null,
        stationName: 'BOM Cine',
        broadcaster: 'unknown',
        powerKw: null,
        source:
          'MAUT (channel number not given in source); tdtrm.es/centros.jsp (CARM Murcia government TDT site, fetched 2026-11-04; lists centres and multiplexes, no coordinates or channel numbers); channel content taken from muxtdt Murcia page (same multiplex content region-wide)'
      }
    ],
    lastUpdate: new Date('2026-11-04T12:00:00Z'),
    source:
      "tdtrm.es/centros.jsp (CARM Murcia government TDT site, fetched 2026-11-04; lists centres and multiplexes, no coordinates or channel numbers): coverage-extension centre 'Alumbres II' (Cartagena) with multiplexes ['MAUT']; tdtrm says extension centres are managed by CARM and the town councils (siteOperator from that statement, not per site); active because listed by the regional government page fetched 2026 (page notes some multiplex columns of extension centres may be hard to read); location NOT placed: no source with coordinates, lat/lon null; channel numbers not given so frequencykHz null; TV channel names per multiplex from muxtdt Murcia page; altM/postcode null, power not given Channel-owner names (broadcaster) in this site come from general knowledge/muxtdt, not a fetched owner source."
  }
]);

// Create indexes (match the Mongoose model)
db.placements.createIndex({ status: 1 });
db.placements.createIndex({ postcode: 1 });
db.placements.createIndex({ 'transmitters.technology': 1, 'transmitters.type': 1 });
