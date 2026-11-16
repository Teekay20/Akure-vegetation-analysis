
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt


# --------------------------------------------------
# 1. File paths
# --------------------------------------------------

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
IMAGES = ROOT / "images"

IMAGES.mkdir(exist_ok=True)

monthly = pd.read_csv(
    DATA / "Akure_Monthly_NDVI_Rainfall_SoilMoisture_2016_2025.csv"
)

anomalies = pd.read_csv(
    DATA / "Akure_Monthly_Anomalies_2016_2025.csv"
)

climatology = pd.read_csv(
    DATA / "Akure_Monthly_Climatology_2016_2025.csv"
)

lagged = pd.read_csv(
    DATA / "Akure_Lagged_Anomaly_Correlations.csv"
)


# --------------------------------------------------
# 2. Prepare data
# --------------------------------------------------

monthly["date"] = pd.to_datetime(monthly["date"])
anomalies["date"] = pd.to_datetime(anomalies["date"])

monthly = monthly.sort_values("date")
anomalies = anomalies.sort_values("date")

month_names = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
]

climatology = climatology.sort_values("calendar_month")


# --------------------------------------------------
# 3. Chart 1: Monthly NDVI
# --------------------------------------------------

fig, ax = plt.subplots(figsize=(12, 5))

ax.plot(
    monthly["date"],
    monthly["NDVI"],
    linewidth=1.2
)

ax.set_title("Monthly NDVI in Akure North and Akure South (2016–2025)")
ax.set_xlabel("Year")
ax.set_ylabel("Mean NDVI")
ax.grid(True, alpha=0.3)

fig.tight_layout()
fig.savefig(IMAGES / "01_monthly_ndvi.png", dpi=300)
plt.close(fig)


# --------------------------------------------------
# 4. Chart 2: Monthly rainfall
# --------------------------------------------------

fig, ax = plt.subplots(figsize=(12, 5))

ax.plot(
    monthly["date"],
    monthly["Rainfall_mm"],
    linewidth=1.2
)

ax.set_title("Monthly Rainfall in Akure North and Akure South (2016–2025)")
ax.set_xlabel("Year")
ax.set_ylabel("Rainfall (mm)")
ax.grid(True, alpha=0.3)

fig.tight_layout()
fig.savefig(IMAGES / "02_monthly_rainfall.png", dpi=300)
plt.close(fig)


# --------------------------------------------------
# 5. Chart 3: Monthly soil moisture
# --------------------------------------------------

fig, ax = plt.subplots(figsize=(12, 5))

ax.plot(
    monthly["date"],
    monthly["Soil_Moisture"],
    linewidth=1.2
)

ax.set_title("Monthly Soil Moisture in Akure North and Akure South (2016–2025)")
ax.set_xlabel("Year")
ax.set_ylabel("Volumetric Soil Moisture")
ax.grid(True, alpha=0.3)

fig.tight_layout()
fig.savefig(IMAGES / "03_monthly_soil_moisture.png", dpi=300)
plt.close(fig)


# --------------------------------------------------
# 6. Chart 4: Monthly climatology
# --------------------------------------------------

fig, axes = plt.subplots(3, 1, figsize=(11, 12))

climatology_variables = [
    ("Mean_NDVI", "Mean NDVI", "NDVI"),
    ("Mean_Rainfall", "Mean Rainfall", "Rainfall (mm)"),
    ("Mean_Soil_Moisture", "Mean Soil Moisture", "Volumetric Soil Moisture")
]

for ax, (column, title, ylabel) in zip(
    axes, climatology_variables
):
    ax.plot(
        month_names,
        climatology[column],
        marker="o",
        linewidth=2
    )
    ax.set_title(title)
    ax.set_ylabel(ylabel)
    ax.grid(True, alpha=0.3)

axes[-1].set_xlabel("Calendar Month")

fig.suptitle(
    "Monthly Climatology of Vegetation, Rainfall and Soil Moisture (2016–2025)",
    fontsize=14
)

fig.tight_layout()
fig.savefig(IMAGES / "04_monthly_climatology.png", dpi=300)
plt.close(fig)


# --------------------------------------------------
# 7. Chart 5: Anomaly relationships
# --------------------------------------------------

fig, axes = plt.subplots(1, 2, figsize=(13, 5))

relationships = [
    ("Rainfall_anomaly", "Rainfall Anomaly", "NDVI vs Rainfall Anomalies"),
    ("Soil_Moisture_anomaly", "Soil Moisture Anomaly",
     "NDVI vs Soil Moisture Anomalies")
]

for ax, (x_column, x_label, title) in zip(
    axes, relationships
):
    x = anomalies[x_column]
    y = anomalies["NDVI_anomaly"]

    ax.scatter(x, y, alpha=0.65)

    slope, intercept = np.polyfit(x, y, 1)
    line_x = np.linspace(x.min(), x.max(), 100)

    ax.plot(
        line_x,
        slope * line_x + intercept,
        linestyle="--"
    )

    r = x.corr(y)

    ax.set_title(f"{title}\nr = {r:.3f}")
    ax.set_xlabel(x_label)
    ax.set_ylabel("NDVI Anomaly")
    ax.axhline(0, linewidth=0.7, alpha=0.5)
    ax.axvline(0, linewidth=0.7, alpha=0.5)
    ax.grid(True, alpha=0.25)

fig.tight_layout()
fig.savefig(IMAGES / "05_anomaly_relationships.png", dpi=300)
plt.close(fig)


# --------------------------------------------------
# 8. Chart 6: Lagged anomaly correlations
# --------------------------------------------------

fig, ax = plt.subplots(figsize=(9, 5))

for driver in lagged["Driver"].unique():
    subset = lagged[lagged["Driver"] == driver].sort_values(
        "Lag_months"
    )

    ax.plot(
        subset["Lag_months"],
        subset["Pearson_r"],
        marker="o",
        linewidth=2,
        label=driver
    )

ax.axhline(0, linewidth=0.8, alpha=0.6)
ax.set_title("Lagged Correlations Between Climate Anomalies and NDVI Anomalies")
ax.set_xlabel("Lag (months)")
ax.set_ylabel("Pearson Correlation (r)")
ax.set_xticks(sorted(lagged["Lag_months"].unique()))
ax.legend(title="Driver")
ax.grid(True, alpha=0.3)

fig.tight_layout()
fig.savefig(IMAGES / "06_lagged_correlations.png", dpi=300)
plt.close(fig)


# --------------------------------------------------
# 9. Completion message
# --------------------------------------------------

print("\nSix charts generated successfully.")

for file in sorted(IMAGES.glob("*.png")):
    print(file.name)

print(f"\nCharts saved in: {IMAGES}")
