# Predicting Yu-Gi-Oh Card Price Changes Based on Tournament Results

## Description
The Yu-Gi-Oh Trading Card Game has a secondary market where card prices fluctuate based on competitive meta shifts. When a deck archetype performs well at a major tournament (YCS events, Regionals, National Championships), demand for its key cards spikes, often causing significant price movement on platforms like TCGPlayer. Conversely, cards from underperforming strategies may see price drops.

This project aims to build a data-driven pipeline that collects both tournament result data and historical card pricing data, then uses machine learning to predict whether a card's price will increase, decrease, or remain stable in the days following a major tournament event. The core hypothesis is that tournament top-cut decklists contain strong predictive signals for short-term card price movements. Success will be measured by achieving an accuracy of 70% when predicting price direction and by proving a clear statistical correlation between tournament performance of cards and their price movements.

If predicting both the direction and magnitude of price changes proves too ambitious given the available data or model performance, the project will fall back to predicting simply whether a card's price will go up or down following a tournament. This simplifies the problem by removing the magnitude estimation, making it easier to collect labeled training data and evaluate model performance with standard metrics like accuracy, precision, and recall. Another potential fallback plan would be to narrow the scope to a single popular archetype or a small set of cards, which would reduce the data collection burden and allow for a deeper, more focused analysis rather than trying to cover the entire card pool.

## Goals
The goal of this project is to successfully predict the direction and approximate magnitude of Yu-Gi-Oh card price changes (increase, decrease, stable) in the 1–15 day period following a major tournament, based on tournament top performing decklist data. Beyond just predicting the prices, this project will aim to identify which features of tournament performance are the biggest drivers of price movements, such as the number of top cut appearances, the win rate of specific cards or archetypes, or diversity of the decks the card appears in. Finally, this project will aim to take the data and prediction and produce data visualization in order to visualize the relationship between tournament results and subsequent price shifts, enabling users to explore trends across different card archetypes and tournament events.

## Data Collection Plan
This project will require two main categories of data: card pricing data, and tournament result data.

Within the United States as well as Europe, the most popular website to buy and sell Yu-Gi-Oh cards is the website TCGPlayer. Therefore, throughout this project the TCGPlayer website will be utilised through web scraping as well as their API in order to collect daily market prices and price trends for cards that are featured in the top cut of tournaments. If the TCGPlayer website proves to be insufficient for data collection existing kaggle data sets could be used to fill gaps. Even adding data from other popular Yu-Gi-Oh card markets such as Ebay and Amazon could be a potential way to ensure that enough pricing data is gathered.

In order to gather the necessary data from tournaments we will be using YGOProDeck public API, which provides card metadata (name, type, archetype, number of copies) as well as tournament decklist information. This API will be used to collect top-cut decklists from major events such as YCS tournaments, Regional Championships, and National Championships, including details like deck composition, player placement, and archetype representation.

## Project Timeline
Week 1–2: Begin by setting up the data collection pipeline by connecting to the YGOProDeck API for the necessary tournament data and pulling from the TCGPlayer website to get pricing/sales data.

Week 3–4: Clean and merge tournament and pricing datasets. Begin feature engineering (top-cut appearance counts, archetype win rates, deck diversity metrics, pre-tournament price trends).

Week 5–6: Exploratory data analysis and initial modeling. Train baseline classifiers and iterate on feature selection.

Week 7: Evaluate model performance, compare against naive baselines, and refine. Begin building visualizations.

Week 8: Finalize visualizations, write up findings, and prepare final presentation.
