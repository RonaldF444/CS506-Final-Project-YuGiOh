"""Generate visualizations from model training output.

Reads cs506_report.json and cluster_exploration.json (produced by train.py)
and outputs PNG figures to visualization/figures/.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

# Paths
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
FIGURES_DIR = SCRIPT_DIR / "figures"
REPORT_PATH = PROJECT_ROOT / "models" / "cs506_report.json"
CLUSTER_PATH = PROJECT_ROOT / "models" / "cluster_exploration.json"


def plot_target_distribution(report: dict) -> None:
    """Histogram of price change distribution in training data."""
    dist = report["target_distribution"]
    bins = dist["bins"]

    starts = [b["bin_start"] for b in bins]
    counts = [b["count"] for b in bins]
    widths = [b["bin_end"] - b["bin_start"] for b in bins]

    fig, ax = plt.subplots(figsize=(10, 6))
    ax.bar(starts, counts, width=widths, align="edge", edgecolor="black", linewidth=0.5)
    ax.axvline(dist["mean"], color="red", linestyle="--", label=f"Mean: {dist['mean']:.1f}%")
    ax.axvline(dist["median"], color="orange", linestyle="--", label=f"Median: {dist['median']:.1f}%")
    ax.set_xlabel("Price Change (%)")
    ax.set_ylabel("Count")
    ax.set_title("Distribution of Post-Tournament Price Changes")
    ax.legend()
    fig.tight_layout()
    fig.savefig(FIGURES_DIR / "target_distribution.png", dpi=150)
    plt.close(fig)
    print("Saved target_distribution.png")


def plot_predicted_vs_actual(report: dict) -> None:
    """Scatter plot of predicted vs actual price changes on test set."""
    pva = report["predicted_vs_actual"]
    points = pva["points"]

    predicted = [p["predicted"] for p in points]
    actual = [p["actual"] for p in points]

    fig, ax = plt.subplots(figsize=(8, 8))
    ax.scatter(predicted, actual, alpha=0.15, s=10, c="steelblue")

    line_min = pva["perfect_line"]["min"]
    line_max = pva["perfect_line"]["max"]
    ax.plot([line_min, line_max], [line_min, line_max], "r--", linewidth=1, label="Perfect prediction")

    ax.set_xlabel("Predicted Price Change (%)")
    ax.set_ylabel("Actual Price Change (%)")
    ax.set_title("Predicted vs Actual Price Change (Test Set)")
    ax.text(
        0.05, 0.95,
        f"R² = {pva['r2']:.4f}\nSpearman = {pva['spearman']:.4f}\nRMSE = {pva['rmse']:.2f}\nn = {pva['count']}",
        transform=ax.transAxes, verticalalignment="top",
        fontsize=10, bbox=dict(boxstyle="round", facecolor="wheat", alpha=0.8),
    )
    ax.legend()
    fig.tight_layout()
    fig.savefig(FIGURES_DIR / "predicted_vs_actual.png", dpi=150)
    plt.close(fig)
    print("Saved predicted_vs_actual.png")


def plot_feature_importance(report: dict) -> None:
    """Horizontal bar chart of XGBoost feature importance."""
    fi = report["feature_importance"]
    features = [f["feature"] for f in fi]
    importances = [f["importance"] for f in fi]

    # Sort by importance
    sorted_idx = np.argsort(importances)
    features = [features[i] for i in sorted_idx]
    importances = [importances[i] for i in sorted_idx]

    fig, ax = plt.subplots(figsize=(10, 6))
    ax.barh(features, importances, color="steelblue", edgecolor="black", linewidth=0.5)
    ax.set_xlabel("Importance (gain)")
    ax.set_title("XGBoost Feature Importance")
    fig.tight_layout()
    fig.savefig(FIGURES_DIR / "feature_importance.png", dpi=150)
    plt.close(fig)
    print("Saved feature_importance.png")


def plot_backtest(report: dict) -> None:
    """Bar chart of top-N backtest ROI and win rate."""
    bt = report["backtest"]
    results = bt["rank_results"]
    baseline_roi = bt["random_baseline"]["roi"]

    top_ns = [r["top_n"] for r in results]
    rois = [r["zero_fee_roi"] for r in results]
    win_rates = [r["win_rate"] for r in results]
    labels = [f"Top {n}" for n in top_ns]

    x = np.arange(len(labels))
    width = 0.35

    fig, ax1 = plt.subplots(figsize=(10, 6))

    bars1 = ax1.bar(x - width / 2, rois, width, label="ROI (%)", color="steelblue", edgecolor="black", linewidth=0.5)
    ax1.axhline(baseline_roi, color="red", linestyle="--", label=f"Random baseline: {baseline_roi:.1f}%")
    ax1.set_ylabel("ROI (%)")
    ax1.set_xlabel("Selection Strategy")
    ax1.set_xticks(x)
    ax1.set_xticklabels(labels)

    ax2 = ax1.twinx()
    bars2 = ax2.bar(x + width / 2, win_rates, width, label="Win Rate (%)", color="orange", edgecolor="black", linewidth=0.5)
    ax2.set_ylabel("Win Rate (%)")

    lines1, labels1 = ax1.get_legend_handles_labels()
    lines2, labels2 = ax2.get_legend_handles_labels()
    ax1.legend(lines1 + lines2, labels1 + labels2, loc="upper right")

    ax1.set_title("Backtest: Model Top-N Picks vs Random Baseline")
    fig.tight_layout()
    fig.savefig(FIGURES_DIR / "backtest_roi.png", dpi=150)
    plt.close(fig)
    print("Saved backtest_roi.png")


def plot_cluster_analysis(cluster_data: dict) -> None:
    """Elbow plot and cluster profiles from KMeans clustering."""
    elbow = cluster_data["elbow_data"]
    profiles = cluster_data["cluster_profiles"]

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 6))

    # Elbow plot
    ks = [e["k"] for e in elbow]
    inertias = [e["inertia"] for e in elbow]
    ax1.plot(ks, inertias, "o-", color="steelblue", linewidth=2)
    ax1.axvline(cluster_data["n_clusters"], color="red", linestyle="--", label=f"k={cluster_data['n_clusters']}")
    ax1.set_xlabel("Number of Clusters (k)")
    ax1.set_ylabel("Inertia")
    ax1.set_title("Elbow Method for Optimal k")
    ax1.legend()

    # Cluster profiles - normalized for comparison
    feature_names = cluster_data["features"]
    stats = cluster_data["feature_stats"]

    cluster_labels = [f"Cluster {p['cluster']} ({p['count']} cards)" for p in profiles]
    x = np.arange(len(feature_names))
    n_clusters = len(profiles)
    bar_width = 0.8 / n_clusters

    for i, profile in enumerate(profiles):
        normalized_vals = []
        for feat in feature_names:
            raw = profile[feat]
            feat_std = stats[feat]["std"]
            feat_mean = stats[feat]["mean"]
            if feat_std > 0:
                normalized_vals.append((raw - feat_mean) / feat_std)
            else:
                normalized_vals.append(0)
        ax2.bar(x + i * bar_width, normalized_vals, bar_width, label=cluster_labels[i])

    ax2.set_xticks(x + bar_width * (n_clusters - 1) / 2)
    ax2.set_xticklabels([f.replace("_", "\n") for f in feature_names], fontsize=8)
    ax2.set_ylabel("Normalized Value (z-score)")
    ax2.set_title("Cluster Profiles (KMeans k=5)")
    ax2.legend(fontsize=7, loc="upper left")
    ax2.axhline(0, color="gray", linewidth=0.5)

    fig.tight_layout()
    fig.savefig(FIGURES_DIR / "cluster_analysis.png", dpi=150)
    plt.close(fig)
    print("Saved cluster_analysis.png")


def main():
    os.makedirs(FIGURES_DIR, exist_ok=True)

    # Load report data
    if not REPORT_PATH.exists():
        print(f"Report not found at {REPORT_PATH}")
        print("Run 'make train' first to generate model output.")
        sys.exit(1)

    with open(REPORT_PATH) as f:
        report = json.load(f)

    plot_target_distribution(report)
    plot_predicted_vs_actual(report)
    plot_feature_importance(report)
    plot_backtest(report)

    # Cluster analysis (separate file)
    if CLUSTER_PATH.exists():
        with open(CLUSTER_PATH) as f:
            cluster_data = json.load(f)
        plot_cluster_analysis(cluster_data)
    else:
        print(f"Cluster data not found at {CLUSTER_PATH}, skipping cluster plot")

    print(f"\nAll figures saved to {FIGURES_DIR}/")


if __name__ == "__main__":
    main()
