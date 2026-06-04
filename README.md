# HealthyMealPlanner

Mobile-first Expo app for logging meals, analyzing meal photos, tracking health concerns, and building healthy meal plans.

## Run The App

```sh
npm install
npm run web
```

The Expo web app runs at `http://localhost`.

## Run The Backend

Start Docker Desktop first, then run:

```sh
npm run db
npm run db:migrate
npm run api
```

The API runs at `http://localhost:4000`.

## Backend Features

- Register with email or phone number plus password
- Login with email or phone number
- JWT-protected user profile
- PostgreSQL tables for users and meal logs
- Meal records for `breakfast`, `lunch`, `dinner`, and `snack`
- Food photo analysis endpoint at `/api/analysis/photo`
- Optional photo upload endpoint at `/api/meals/upload`
- Profile storage for health concerns, cuisine preferences, restrictions, and foods to avoid

## Food Photo Analysis

The backend uses two free/developer-friendly services:

- Clarifai food image recognition: identifies likely foods in the uploaded image.
- USDA FoodData Central: looks up calories and nutrients for the detected food name.

Create a `.env` file and set:

```sh
CLARIFAI_API_KEY=your-clarifai-personal-access-token
USDA_API_KEY=DEMO_KEY
```

For more reliable USDA quota, get a free FoodData Central API key and replace `DEMO_KEY`.

## Local Config

Copy `.env.example` to `.env` if you need to customize the API port, database URL, or JWT secret.
