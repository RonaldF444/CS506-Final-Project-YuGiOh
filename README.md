# Predicting Changes in Yu-Gi-Oh Card Price Based on Tournament Results
## Description
This project takes a deeper look into the trading card game Yu-Gi-Oh and the card market built around it. When a deck archetype (A group of cards specifically designed to work together) performs well at a major tournament, demand for its best and rarest cards spikes, often causing significant price movement on online marketplaces like TCGPlayer. Similarly, archetypes which perform badly will often see significant dips in price.

This project is driven by an interest in quantitative finance and exploring if tactics typically utilized in traditional financial markets, like the stock market, may be applied to a less efficient market like the one for Yu-Gi-Oh cards. The Yu-Gi-Oh card market is in many ways similar to traditional financial markets however, it operates on a smaller scale with less competition. This project aims to exploit the smaller scale of the market in order to find inefficiencies or patterns which could be used to predict price movements before the market is able to react, similar to how quantitative traders aim to identify and capitalize on mispricings in financial markets.

In order to achieve this, the plan is to build a pipeline that collects both tournament result data and historical card pricing data. Then, using machine learning, predict whether a card's price will increase, decrease, or remain the same in the days following a major tournament. The goal is to find predictive signals for card movements from the decklists that perform the best in tournaments. Currently, the project will be considered successful by achieving an accuracy of at least 70% when predicting a cards price direction and magnitude, however this is subject to change as the project develops and the data becomes better understood.

The initial modeling will explore classification methods such as logistic regression and decision trees, potentially progressing to more advanced methods like XGBoost. The data will be split using a train/test approach, where earlier tournament data is used for training while the most recent events are reserved for testing. Visualizations will include price trajectory plots as well as feature importance charts to highlight which tournament metrics are the strongest predictors of price movement.

If predicting both the direction and magnitude of price changes becomes impossible within the timeframe, the project will fall back to predicting whether a card's price will go up or down following a tournament. This simplifies the problem making it easier to collect labeled training data and evaluate model performance with standard metrics. Another potential fallback plan would be to narrow the scope to a single popular archetype or a small set of cards.
## Project Timeline
Week 1–2: Begin by setting up the data collection pipeline by connecting to the YGOProDeck API for the necessary tournament data, then pull from the TCGPlayer website to get pricing/sales data. Begin the initial data cleaning.

Week 3–4: Clean and merge tournament and pricing datasets. Begin feature engineering and create preliminary visualizations.

Week 5–6: Begin data analysis and initial modeling. Train classifiers, iterate through and test on the feature selection, and begin to generate preliminary results.

Week 7: Evaluate model performance, refine models, and build final visualizations. Set up GitHub workflow, Makefile, and test code.

Week 8: After ensuring all the code is reproducible, finalize visualizations, README, and presentation.
## Goals
The goal of this project is to successfully predict the direction and approximate magnitude of Yu-Gi-Oh card price changes (increase, decrease, stable) in the 1–15 day period following a major tournament, based on the top performing decklist data. Beyond just predicting the prices, this project will aim to identify which features of tournament performance are the biggest drivers of price movements, such as the number of top cut appearances, the win rate of specific cards or archetypes, or diversity of the decks the card appears in. Finally, this project will aim to produce data visualizations of the prediction model, in order to visualize the relationship between tournament results and subsequent price shifts, enabling users to explore trends across different events and card archetypes.
## Data Collection Plan
This project will require two main categories of data: card pricing data, and tournament result data.

Within the United States as well as Europe, the most popular website to buy and sell Yu-Gi-Oh cards is the website TCGPlayer. Throughout the project this website will be utilised through web scraping as well as their API in order to collect daily market prices and price trends for cards that are featured in the top cut of tournaments. If the TCGPlayer website proves to be insufficient for data collection, existing kaggle data sets could be used to fill gaps. Potentially adding pricing data from other popular Yu-Gi-Oh card markets such as Ebay and Amazon could be a way to ensure that enough data is gathered.

In order to gather the necessary data from tournaments we will be using YGOProDeck public API, which provides card metadata (name, type, archetype, number of copies) as well as tournament decklist information. This API will be used to collect top-cut decklists from major events such as YCS tournaments, Regional Championships, and National Championships.
