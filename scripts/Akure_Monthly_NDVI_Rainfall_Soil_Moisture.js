// ============================================================
// VEGETATION DYNAMICS AND THEIR RELATIONSHIP WITH RAINFALL
// AND SOIL MOISTURE IN AKURE NORTH AND AKURE SOUTH, ONDO STATE
// STUDY PERIOD: JANUARY 2016 - DECEMBER 2025
//
// DATASETS:
// 1. MODIS MOD13Q1 NDVI (16-day composites, 250 m)
// 2. CHIRPS DAILY precipitation (about 5.5 km)
// 3. ERA5-Land MONTHLY AGGREGATED soil moisture, layer 1 (about 11 km, modelled)
//
// SECTIONS
//  1 Study area            9 Raw correlations
//  2 Study period         10 Seasonality-adjusted (anomaly) correlations
//  3 MODIS NDVI           11 Anomaly scatter plots
//  4 CHIRPS rainfall      12 Lagged anomaly correlations (EXPLORATORY)
//  5 ERA5-Land            13 Mean NDVI map
//  6 Monthly records      14 Mean annual rainfall map
//  7 Checks               15 Mean soil moisture map
//  8 Time-series charts   16 Exports (run from the Tasks tab)
//
// Correlation is association, not causation. P-values ignore temporal
// autocorrelation and are exploratory.
// ============================================================

// Switches
var SHOW_CHARTS = true;    // set false if the Console is slow or times out
var PRINT_LAG = false;     // lag table is exported anyway; printing recomputes everything


// ============================================================
// 1. STUDY AREA
// ============================================================

var lgas = ee.FeatureCollection('FAO/GAUL/2015/level2')
  .filter(ee.Filter.eq('ADM0_NAME', 'Nigeria'))
  .filter(ee.Filter.eq('ADM1_NAME', 'Ondo'))
  .filter(ee.Filter.inList('ADM2_NAME', ['Akure North', 'Akure South']));

var studyArea = lgas.geometry();

print('Selected LGAs', lgas.aggregate_array('ADM2_NAME'));
print('Number of selected LGAs (expected 2)', lgas.size());
print('Study area area (km2)', studyArea.area(1).divide(1000000));

Map.centerObject(lgas, 10);
Map.addLayer(lgas, {color: 'red'}, 'Akure North and Akure South boundaries');


// ============================================================
// 2. STUDY PERIOD
// ============================================================

var startDate = ee.Date('2016-01-01');
var endDate = ee.Date('2026-01-01');
var numberOfMonths = 120;
var monthNumbers = ee.List.sequence(0, numberOfMonths - 1);
var monthStarts = monthNumbers.map(function(n) {
  return startDate.advance(ee.Number(n), 'month');
});


// ============================================================
// 3. MODIS NDVI
// ============================================================
// SummaryQA 0 = good, 1 = marginal. NDVI scale factor 0.0001.
// Each 16-day composite is stamped with its start date, so a month holds one or
// two composites, and a composite can cover days from the next month.

var modis = ee.ImageCollection('MODIS/061/MOD13Q1')
  .filterDate(startDate, endDate)
  .filterBounds(studyArea)
  .map(function(image) {
    var qualityMask = image.select('SummaryQA').lte(1);
    var ndvi = image.select('NDVI').multiply(0.0001)
      .rename('NDVI').updateMask(qualityMask);
    return ndvi.copyProperties(image, ['system:time_start']);
  });

print('MODIS image count', modis.size());
print('MODIS bands', modis.first().bandNames());

var monthlyNDVI = ee.ImageCollection.fromImages(
  monthStarts.map(function(monthStart) {
    monthStart = ee.Date(monthStart);
    var monthEnd = monthStart.advance(1, 'month');
    var monthlyImage = modis.filterDate(monthStart, monthEnd).mean().rename('NDVI');
    return monthlyImage.set({
      'system:time_start': monthStart.millis(),
      'year': monthStart.get('year'),
      'month': monthStart.get('month')
    });
  })
);

print('MODIS monthly image count', monthlyNDVI.size());


// ============================================================
// 4. CHIRPS DAILY RAINFALL
// ============================================================

var chirpsDaily = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
  .filterDate(startDate, endDate)
  .filterBounds(studyArea)
  .select('precipitation');

print('CHIRPS daily image count', chirpsDaily.size());
print('CHIRPS bands', chirpsDaily.first().bandNames());

var monthlyRainfall = ee.ImageCollection.fromImages(
  monthStarts.map(function(monthStart) {
    monthStart = ee.Date(monthStart);
    var monthEnd = monthStart.advance(1, 'month');
    var monthlyImage = chirpsDaily.filterDate(monthStart, monthEnd)
      .sum().rename('Rainfall_mm');
    return monthlyImage.set({
      'system:time_start': monthStart.millis(),
      'year': monthStart.get('year'),
      'month': monthStart.get('month')
    });
  })
);

print('CHIRPS monthly image count', monthlyRainfall.size());


// ============================================================
// 5. ERA5-LAND SOIL MOISTURE (model output, not a measurement)
// ============================================================

var era5 = ee.ImageCollection('ECMWF/ERA5_LAND/MONTHLY_AGGR')
  .filterDate(startDate, endDate)
  .filterBounds(studyArea)
  .select('volumetric_soil_water_layer_1');

print('ERA5-Land monthly image count', era5.size());

var monthlySoilMoisture = era5.map(function(image) {
  return image.rename('Soil_Moisture')
    .copyProperties(image, ['system:time_start']);
});

print('ERA5-Land bands', monthlySoilMoisture.first().bandNames());


// ============================================================
// 6. THE 120 MONTHLY RECORDS
// ============================================================
// Each variable is averaged at its own native scale.

var monthlyResults = ee.FeatureCollection(
  monthStarts.map(function(monthStart) {
    monthStart = ee.Date(monthStart);
    var monthEnd = monthStart.advance(1, 'month');

    var ndviImage = monthlyNDVI.filterDate(monthStart, monthEnd).first();
    var rainfallImage = monthlyRainfall.filterDate(monthStart, monthEnd).first();
    var soilImage = monthlySoilMoisture.filterDate(monthStart, monthEnd).first();

    var ndviValue = ee.Image(ndviImage).reduceRegion({
      reducer: ee.Reducer.mean(), geometry: studyArea,
      scale: 250, maxPixels: 1e13, tileScale: 4
    }).get('NDVI');

    var rainfallValue = ee.Image(rainfallImage).reduceRegion({
      reducer: ee.Reducer.mean(), geometry: studyArea,
      scale: 5500, maxPixels: 1e13, tileScale: 4
    }).get('Rainfall_mm');

    var soilValue = ee.Image(soilImage).reduceRegion({
      reducer: ee.Reducer.mean(), geometry: studyArea,
      scale: 11132, maxPixels: 1e13, tileScale: 4
    }).get('Soil_Moisture');

    return ee.Feature(null, {
      'date': monthStart.format('YYYY-MM'),
      'system:time_start': monthStart.millis(),
      'NDVI': ndviValue,
      'Rainfall_mm': rainfallValue,
      'Soil_Moisture': soilValue
    });
  })
);


// ============================================================
// 7. CHECKS
// ============================================================

print('Monthly results (first 10)', monthlyResults.limit(10));
print('Total monthly records (expected 120)', monthlyResults.size());

var validMonthlyResults = monthlyResults.filter(
  ee.Filter.notNull(['NDVI', 'Rainfall_mm', 'Soil_Moisture'])
);

print('Valid monthly records for correlation', validMonthlyResults.size());


// ============================================================
// 8. MONTHLY TIME-SERIES CHARTS
// ============================================================
// To save a chart for the README, click the pop-out arrow and download the PNG.

function lineChart(property, title, yTitle) {
  return ui.Chart.feature.byFeature({
    features: monthlyResults, xProperty: 'date', yProperties: [property]
  })
  .setChartType('LineChart')
  .setOptions({
    title: title,
    hAxis: {title: 'Year-Month', slantedText: true, slantedTextAngle: 45},
    vAxis: {title: yTitle},
    lineWidth: 1, pointSize: 0, legend: {position: 'none'}
  });
}

if (SHOW_CHARTS) {
  print(lineChart('NDVI', 'Monthly Mean NDVI (2016-2025)', 'NDVI'));
  print(lineChart('Rainfall_mm', 'Monthly Rainfall (2016-2025)', 'Rainfall (mm/month)'));
  print(lineChart('Soil_Moisture', 'Monthly Mean Soil Moisture (2016-2025)',
    'Volumetric Soil Moisture (m³/m³)'));
}


// ============================================================
// 9. RAW CORRELATIONS (include the seasonal cycle)
// ============================================================
// Prints r and p separately so you do not need to expand an object.

function corrPrint(label, fc, a, b) {
  var c = fc.reduceColumns({
    reducer: ee.Reducer.pearsonsCorrelation(),
    selectors: [a, b]
  });
  print(label, 'r', c.get('correlation'), 'p-value', c.get('p-value'));
}

corrPrint('RAW: NDVI and rainfall', validMonthlyResults, 'NDVI', 'Rainfall_mm');
corrPrint('RAW: NDVI and soil moisture', validMonthlyResults, 'NDVI', 'Soil_Moisture');
corrPrint('RAW: rainfall and soil moisture', validMonthlyResults, 'Rainfall_mm', 'Soil_Moisture');


// ============================================================
// 10. SEASONALITY-ADJUSTED (ANOMALY) CORRELATIONS
// ============================================================
// Anomaly = observed value minus the 2016-2025 mean for the same calendar month.

// Step 1: add the calendar month to each record.
var monthlyWithCalendarMonth = validMonthlyResults.map(function(feature) {
  var month = ee.Date(feature.get('system:time_start')).get('month');
  return feature.set('calendar_month', month);
});

// Step 2: long-term average of each calendar month (January to December).
var calendarMonths = ee.List.sequence(1, 12);

var monthlyClimatology = ee.FeatureCollection(
  calendarMonths.map(function(month) {
    month = ee.Number(month);
    var sameCalendarMonth = monthlyWithCalendarMonth
      .filter(ee.Filter.eq('calendar_month', month));
    return ee.Feature(null, {
      'calendar_month': month,
      'Mean_NDVI': sameCalendarMonth.aggregate_mean('NDVI'),
      'Mean_Rainfall': sameCalendarMonth.aggregate_mean('Rainfall_mm'),
      'Mean_Soil_Moisture': sameCalendarMonth.aggregate_mean('Soil_Moisture')
    });
  })
);

// Step 3: anomalies.
var seasonalityAdjustedResults = monthlyWithCalendarMonth.map(function(feature) {
  var month = feature.get('calendar_month');
  var normalMonth = monthlyClimatology
    .filter(ee.Filter.eq('calendar_month', month)).first();

  return feature.set({
    'NDVI_anomaly': ee.Number(feature.get('NDVI'))
      .subtract(ee.Number(normalMonth.get('Mean_NDVI'))),
    'Rainfall_anomaly': ee.Number(feature.get('Rainfall_mm'))
      .subtract(ee.Number(normalMonth.get('Mean_Rainfall'))),
    'Soil_Moisture_anomaly': ee.Number(feature.get('Soil_Moisture'))
      .subtract(ee.Number(normalMonth.get('Mean_Soil_Moisture')))
  });
});

print('Seasonality-adjusted record count (expected 120)', seasonalityAdjustedResults.size());

// Step 4: correlations of the anomalies.
corrPrint('ANOMALY: NDVI and rainfall', seasonalityAdjustedResults,
  'NDVI_anomaly', 'Rainfall_anomaly');
corrPrint('ANOMALY: NDVI and soil moisture', seasonalityAdjustedResults,
  'NDVI_anomaly', 'Soil_Moisture_anomaly');
corrPrint('ANOMALY: rainfall and soil moisture', seasonalityAdjustedResults,
  'Rainfall_anomaly', 'Soil_Moisture_anomaly');


// ============================================================
// 11. ANOMALY SCATTER PLOTS
// ============================================================

function scatter(xProp, yProp, title, xTitle, yTitle) {
  return ui.Chart.feature.byFeature({
    features: seasonalityAdjustedResults, xProperty: xProp, yProperties: [yProp]
  })
  .setChartType('ScatterChart')
  .setOptions({
    title: title,
    hAxis: {title: xTitle}, vAxis: {title: yTitle},
    pointSize: 3, legend: {position: 'none'}
  });
}

if (SHOW_CHARTS) {
  print(scatter('Rainfall_anomaly', 'NDVI_anomaly',
    'NDVI and Rainfall Anomalies (2016-2025)', 'Rainfall anomaly (mm)', 'NDVI anomaly'));
  print(scatter('Soil_Moisture_anomaly', 'NDVI_anomaly',
    'NDVI and Soil Moisture Anomalies (2016-2025)', 'Soil moisture anomaly (m³/m³)', 'NDVI anomaly'));
  print(scatter('Rainfall_anomaly', 'Soil_Moisture_anomaly',
    'Rainfall and Soil Moisture Anomalies (2016-2025)', 'Rainfall anomaly (mm)', 'Soil moisture anomaly (m³/m³)'));
}


// ============================================================
// 12. LAGGED ANOMALY CORRELATIONS (EXPLORATORY, NEW)
// ============================================================
// Driver anomaly in month t-k against NDVI anomaly in month t, for k = 0 to 3.
// This is eight tests, so treat any single p-value cautiously: a Bonferroni
// threshold would be 0.05 / 8 = 0.00625. Results go to a CSV export.

var anomalyList = seasonalityAdjustedResults.sort('system:time_start').toList(120);

function lagTable(driver, label) {
  return ee.FeatureCollection(ee.List.sequence(0, 3).map(function(k) {
    k = ee.Number(k);
    var pairs = ee.FeatureCollection(ee.List.sequence(k, 119).map(function(i) {
      i = ee.Number(i);
      var now = ee.Feature(anomalyList.get(i));
      var prior = ee.Feature(anomalyList.get(i.subtract(k)));
      return ee.Feature(null, {y: now.get('NDVI_anomaly'), x: prior.get(driver)});
    }));
    var c = pairs.reduceColumns({
      reducer: ee.Reducer.pearsonsCorrelation(), selectors: ['x', 'y']
    });
    return ee.Feature(null, {
      Driver: label, Lag_months: k, Pairs: pairs.size(),
      Pearson_r: c.get('correlation'), p_value: c.get('p-value')
    });
  }));
}

var lagResults = lagTable('Rainfall_anomaly', 'Rainfall')
  .merge(lagTable('Soil_Moisture_anomaly', 'Soil moisture'));

if (PRINT_LAG) {
  print('Lagged anomaly correlations (driver in month t-k, NDVI anomaly in month t)', lagResults);
}


// ============================================================
// 13. LONG-TERM MEAN NDVI (MAP)
// ============================================================

var meanNDVI = monthlyNDVI.mean().clip(studyArea).rename('Mean_NDVI');

Map.addLayer(meanNDVI, {min: 0.2, max: 0.9,
  palette: ['brown', 'yellow', 'lightgreen', 'green', 'darkgreen']},
  'Mean NDVI (2016-2025)');


// ============================================================
// 14. MEAN ANNUAL RAINFALL (MAP)
// ============================================================

var years = ee.List.sequence(2016, 2025);

var annualRainfall = ee.ImageCollection.fromImages(
  years.map(function(year) {
    year = ee.Number(year);
    var yearStart = ee.Date.fromYMD(year, 1, 1);
    var yearEnd = yearStart.advance(1, 'year');
    return chirpsDaily.filterDate(yearStart, yearEnd).sum()
      .rename('Annual_Rainfall_mm')
      .set({'year': year, 'system:time_start': yearStart.millis()});
  })
);

var meanAnnualRainfall = annualRainfall.mean().clip(studyArea)
  .rename('Mean_Annual_Rainfall_mm');

Map.addLayer(meanAnnualRainfall, {min: 1000, max: 2500,
  palette: ['white', 'lightblue', 'blue', 'darkblue']},
  'Mean Annual Rainfall (2016-2025)');


// ============================================================
// 15. LONG-TERM MEAN SOIL MOISTURE (MAP)
// ============================================================

var meanSoilMoisture = monthlySoilMoisture.mean().clip(studyArea)
  .rename('Mean_Soil_Moisture');

Map.addLayer(meanSoilMoisture, {min: 0.1, max: 0.5,
  palette: ['brown', 'yellow', 'lightblue', 'blue', 'darkblue']},
  'Mean Soil Moisture (2016-2025)');


// ============================================================
// 16. EXPORTS: open the Tasks tab and run each task
// ============================================================

var FOLDER = 'GEE_Akure_Research';

// A. The 120 monthly records
Export.table.toDrive({
  collection: monthlyResults,
  description: 'Akure_Monthly_NDVI_Rainfall_SoilMoisture_2016_2025',
  folder: FOLDER, fileFormat: 'CSV',
  selectors: ['date', 'NDVI', 'Rainfall_mm', 'Soil_Moisture']
});

// B. Monthly records with anomalies (reproduces section 10)
Export.table.toDrive({
  collection: seasonalityAdjustedResults,
  description: 'Akure_Monthly_Anomalies_2016_2025',
  folder: FOLDER, fileFormat: 'CSV',
  selectors: ['date', 'calendar_month', 'NDVI', 'Rainfall_mm', 'Soil_Moisture',
    'NDVI_anomaly', 'Rainfall_anomaly', 'Soil_Moisture_anomaly']
});

// C. The 12 calendar-month averages used for the anomalies
Export.table.toDrive({
  collection: monthlyClimatology,
  description: 'Akure_Monthly_Climatology_2016_2025',
  folder: FOLDER, fileFormat: 'CSV',
  selectors: ['calendar_month', 'Mean_NDVI', 'Mean_Rainfall', 'Mean_Soil_Moisture']
});

// D. Lagged anomaly correlations (exploratory)
Export.table.toDrive({
  collection: lagResults,
  description: 'Akure_Lagged_Anomaly_Correlations',
  folder: FOLDER, fileFormat: 'CSV',
  selectors: ['Driver', 'Lag_months', 'Pairs', 'Pearson_r', 'p_value']
});

// E. Rasters
Export.image.toDrive({
  image: meanNDVI, description: 'Akure_Mean_NDVI_2016_2025',
  folder: FOLDER, region: studyArea, scale: 250, crs: 'EPSG:4326', maxPixels: 1e13
});
Export.image.toDrive({
  image: meanAnnualRainfall, description: 'Akure_Mean_Annual_Rainfall_2016_2025',
  folder: FOLDER, region: studyArea, scale: 5500, crs: 'EPSG:4326', maxPixels: 1e13
});
Export.image.toDrive({
  image: meanSoilMoisture, description: 'Akure_Mean_Soil_Moisture_2016_2025',
  folder: FOLDER, region: studyArea, scale: 11132, crs: 'EPSG:4326', maxPixels: 1e13
});

print('Analysis setup completed. Run the export tasks in the Tasks tab.');