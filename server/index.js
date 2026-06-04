require('dotenv').config();

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { query } = require('./db');

const app = express();
const port = Number(process.env.API_PORT || 4000);
const jwtSecret = process.env.JWT_SECRET || 'dev-only-change-me';
const uploadDir = path.join(__dirname, 'uploads');
const clarifaiApiKey = process.env.CLARIFAI_API_KEY;
const usdaApiKey = process.env.USDA_API_KEY || 'DEMO_KEY';
const clarifaiFoodModelUrl =
  'https://api.clarifai.com/v2/users/clarifai/apps/main/models/food-item-recognition/versions/1d5fd481e0cf4826aa72ec3ff049e044/outputs';

fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 8 * 1024 * 1024,
  },
});

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(uploadDir));

function normalizeEmail(email) {
  return email ? email.trim().toLowerCase() : null;
}

function normalizePhone(phone) {
  return phone ? phone.replace(/[^\d+]/g, '') : null;
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    healthConcerns: user.health_concerns || [],
    cuisinePreferences: user.cuisine_preferences || [],
    dietaryRestrictions: user.dietary_restrictions || [],
    foodsToAvoid: user.foods_to_avoid || [],
  };
}

function signToken(user) {
  return jwt.sign({ sub: user.id }, jwtSecret, { expiresIn: '30d' });
}

function findUserByIdentifier(identifier) {
  const cleanIdentifier = identifier.trim();
  const email = cleanIdentifier.includes('@') ? normalizeEmail(cleanIdentifier) : null;
  const phone = email ? null : normalizePhone(cleanIdentifier);

  return query(
    `SELECT *
     FROM users
     WHERE ($1::text IS NOT NULL AND email = $1)
        OR ($2::text IS NOT NULL AND phone = $2)
     LIMIT 1`,
    [email, phone]
  );
}

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    const result = await query('SELECT * FROM users WHERE id = $1', [payload.sub]);

    if (!result.rows.length) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = result.rows[0];
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

app.get('/api/health', async (req, res) => {
  await query('SELECT 1');
  res.json({ ok: true });
});

app.post('/api/auth/register', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const phone = normalizePhone(req.body.phone);
  const password = req.body.password || '';

  if (!email && !phone) {
    return res.status(400).json({ error: 'Email or phone is required' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const result = await query(
      `INSERT INTO users (email, phone, password_hash)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [email, phone, passwordHash]
    );
    const user = result.rows[0];

    return res.status(201).json({
      token: signToken(user),
      user: publicUser(user),
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'An account already exists for that email or phone' });
    }

    return res.status(500).json({ error: 'Unable to create account' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const identifier = req.body.identifier || req.body.email || req.body.phone || '';
  const password = req.body.password || '';

  if (!identifier || !password) {
    return res.status(400).json({ error: 'Identifier and password are required' });
  }

  const result = await findUserByIdentifier(identifier);
  const user = result.rows[0];

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid login credentials' });
  }

  return res.json({
    token: signToken(user),
    user: publicUser(user),
  });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.put('/api/me/profile', requireAuth, async (req, res) => {
  const result = await query(
    `UPDATE users
     SET health_concerns = $2,
         cuisine_preferences = $3,
         dietary_restrictions = $4,
         foods_to_avoid = $5,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      req.user.id,
      req.body.healthConcerns || [],
      req.body.cuisinePreferences || [],
      req.body.dietaryRestrictions || [],
      req.body.foodsToAvoid || [],
    ]
  );

  res.json({ user: publicUser(result.rows[0]) });
});

app.get('/api/meals', requireAuth, async (req, res) => {
  const result = await query(
    `SELECT *
     FROM meal_logs
     WHERE user_id = $1
     ORDER BY logged_at DESC
     LIMIT 100`,
    [req.user.id]
  );

  res.json({ meals: result.rows.map(formatMeal) });
});

app.post('/api/meals', requireAuth, async (req, res) => {
  try {
    const meal = req.body;
    const result = await insertMeal(req.user.id, meal);
    res.status(201).json({ meal: formatMeal(result.rows[0]) });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Unable to save meal' });
  }
});

app.post('/api/meals/upload', requireAuth, upload.single('photo'), async (req, res) => {
  try {
    const nutrition = req.body.nutrition ? JSON.parse(req.body.nutrition) : {};
    const fileUrl = req.file ? `/uploads/${req.file.filename}` : null;
    const result = await insertMeal(req.user.id, {
      ...nutrition,
      mealType: req.body.mealType,
      photoUrl: fileUrl,
    });

    res.status(201).json({ meal: formatMeal(result.rows[0]) });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Unable to upload meal' });
  }
});

app.post('/api/analysis/photo', requireAuth, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Photo is required' });
    }

    const analysis = await analyzeFoodPhoto(req.file.path);
    res.json({ analysis });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Unable to analyze photo' });
  }
});

function insertMeal(userId, meal) {
  const mealType = String(meal.mealType || meal.meal_type || '').toLowerCase();

  if (!['breakfast', 'lunch', 'dinner', 'snack'].includes(mealType)) {
    const error = new Error('Meal type must be breakfast, lunch, dinner, or snack');
    error.statusCode = 400;
    throw error;
  }

  return query(
    `INSERT INTO meal_logs (
       user_id, meal_type, name, calories, protein, carbs, fat, fiber, sodium,
       confidence, notes, photo_url
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      userId,
      mealType,
      meal.name || 'Logged meal',
      Number(meal.calories || 0),
      Number(meal.protein || 0),
      Number(meal.carbs || 0),
      Number(meal.fat || 0),
      Number(meal.fiber || 0),
      Number(meal.sodium || 0),
      meal.confidence || null,
      meal.notes || null,
      meal.photoUrl || meal.photo_url || null,
    ]
  );
}

async function analyzeFoodPhoto(filePath) {
  if (!clarifaiApiKey) {
    const error = new Error('CLARIFAI_API_KEY is not configured on the API server');
    error.statusCode = 503;
    throw error;
  }

  const predictions = await recognizeFoodWithClarifai(filePath);

  if (!predictions.length) {
    const error = new Error('No food was detected in this image');
    error.statusCode = 422;
    throw error;
  }

  const topPrediction = predictions[0];
  const nutrients = await lookupNutritionWithUsda(topPrediction.name);

  return {
    name: `Photo scan: ${topPrediction.name}`,
    calories: nutrients.calories,
    protein: nutrients.protein,
    carbs: nutrients.carbs,
    fat: nutrients.fat,
    fiber: nutrients.fiber,
    sodium: nutrients.sodium,
    confidence: `${Math.round(topPrediction.value * 100)}%`,
    notes: `Detected ${predictions
      .slice(0, 3)
      .map((item) => item.name)
      .join(', ')}. Nutrition uses USDA data for "${nutrients.source}". Confirm portion size for best accuracy.`,
    detectedFoods: predictions.slice(0, 5),
    nutritionSource: nutrients.source,
  };
}

async function recognizeFoodWithClarifai(filePath) {
  const imageBytes = fs.readFileSync(filePath);
  const response = await fetch(clarifaiFoodModelUrl, {
    method: 'POST',
    headers: {
      Authorization: `Key ${clarifaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: [
        {
          data: {
            image: {
              base64: imageBytes.toString('base64'),
            },
          },
        },
      ],
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data?.status?.description || 'Clarifai food recognition failed');
    error.statusCode = response.status;
    throw error;
  }

  return (
    data.outputs?.[0]?.data?.concepts
      ?.map((concept) => ({
        name: concept.name,
        value: Number(concept.value || 0),
      }))
      .filter((concept) => concept.value >= 0.2) || []
  );
}

async function lookupNutritionWithUsda(foodName) {
  const response = await fetch(
    `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(usdaApiKey)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: foodName,
        pageSize: 1,
        dataType: ['Survey (FNDDS)', 'Foundation', 'SR Legacy'],
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data?.error?.message || 'USDA nutrition lookup failed');
    error.statusCode = response.status;
    throw error;
  }

  const food = data.foods?.[0];

  if (!food) {
    return {
      source: foodName,
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
      sodium: 0,
    };
  }

  return {
    source: food.description || foodName,
    calories: Math.round(getNutrient(food, ['Energy']) || 0),
    protein: roundMacro(getNutrient(food, ['Protein'])),
    carbs: roundMacro(getNutrient(food, ['Carbohydrate'])),
    fat: roundMacro(getNutrient(food, ['Total lipid', 'Total Fat'])),
    fiber: roundMacro(getNutrient(food, ['Fiber'])),
    sodium: Math.round(getNutrient(food, ['Sodium']) || 0),
  };
}

function getNutrient(food, names) {
  const nutrient = food.foodNutrients?.find((item) =>
    names.some((name) => item.nutrientName?.toLowerCase().includes(name.toLowerCase()))
  );

  return Number(nutrient?.value || 0);
}

function roundMacro(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function formatMeal(meal) {
  return {
    id: meal.id,
    mealType: meal.meal_type,
    name: meal.name,
    calories: meal.calories,
    protein: Number(meal.protein),
    carbs: Number(meal.carbs),
    fat: Number(meal.fat),
    fiber: Number(meal.fiber),
    sodium: meal.sodium,
    confidence: meal.confidence,
    notes: meal.notes,
    photoUrl: meal.photo_url,
    loggedAt: meal.logged_at,
  };
}

app.use((error, req, res, next) => {
  const status = error.statusCode || 500;
  res.status(status).json({ error: error.message || 'Server error' });
});

app.listen(port, () => {
  console.log(`NutriTrack API listening on http://localhost:${port}`);
});
