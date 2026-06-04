import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const healthConcerns = [
  {
    id: 'blood-pressure',
    label: 'High blood pressure',
    focus: 'lower sodium, more potassium',
    foods: ['Spinach', 'Lentils', 'Bananas', 'Greek yogurt'],
  },
  {
    id: 'ra',
    label: 'Rheumatoid arthritis',
    focus: 'anti-inflammatory omega-3s',
    foods: ['Salmon', 'Walnuts', 'Blueberries', 'Olive oil'],
  },
  {
    id: 'osteoporosis',
    label: 'Osteoporosis',
    focus: 'calcium, vitamin D, protein',
    foods: ['Sardines', 'Fortified tofu', 'Kale', 'Cottage cheese'],
  },
  {
    id: 'diabetes',
    label: 'Diabetes',
    focus: 'steady carbs and fiber',
    foods: ['Beans', 'Steel-cut oats', 'Avocado', 'Chia seeds'],
  },
  {
    id: 'heart-health',
    label: 'Heart health',
    focus: 'fiber and unsaturated fats',
    foods: ['Oats', 'Almonds', 'Edamame', 'Berries'],
  },
];

const cuisineOptions = ['Mediterranean', 'Asian', 'Mexican', 'American', 'Indian'];
const restrictionOptions = ['Vegetarian', 'Low sodium', 'Gluten free', 'Dairy free'];
const mealTypeOptions = ['breakfast', 'lunch', 'dinner', 'snack'];
const API_BASE_URL = 'http://localhost:4000/api';

const defaultFoods = [
  {
    name: 'Greek yogurt with berries',
    meal: 'Breakfast',
    calories: 260,
    protein: 20,
    carbs: 32,
    fat: 7,
    fiber: 6,
    sodium: 75,
  },
  {
    name: 'Quinoa chickpea bowl',
    meal: 'Lunch',
    calories: 430,
    protein: 18,
    carbs: 58,
    fat: 14,
    fiber: 12,
    sodium: 320,
  },
];

const photoAnalysisSamples = [
  {
    name: 'Photo scan: grilled chicken salad',
    calories: 420,
    protein: 32,
    carbs: 24,
    fat: 21,
    fiber: 8,
    sodium: 410,
    confidence: 'Medium',
    notes: 'Looks like a lean protein salad. Dressing and portion size can change calories.',
  },
  {
    name: 'Photo scan: salmon rice bowl',
    calories: 560,
    protein: 36,
    carbs: 54,
    fat: 22,
    fiber: 7,
    sodium: 520,
    confidence: 'Medium',
    notes: 'Estimated fish, grain, and vegetables. Sauces may add sodium.',
  },
  {
    name: 'Photo scan: vegetable omelet plate',
    calories: 390,
    protein: 25,
    carbs: 18,
    fat: 24,
    fiber: 5,
    sodium: 480,
    confidence: 'Medium',
    notes: 'Estimated eggs and vegetables. Cheese or added salt may raise sodium.',
  },
];

const mealTemplates = {
  Mediterranean: [
    ['Greek yogurt, walnuts, berries', 'Lentil cucumber salad', 'Salmon, farro, roasted vegetables'],
    ['Oat bowl with chia', 'Turkey hummus wrap', 'Chicken souvlaki plate'],
  ],
  Asian: [
    ['Miso oats with egg', 'Tofu brown rice bowl', 'Ginger salmon with bok choy'],
    ['Berry soy smoothie', 'Chicken lettuce cups', 'Soba noodles with edamame'],
  ],
  Mexican: [
    ['Avocado egg tacos', 'Black bean veggie bowl', 'Chicken fajita salad'],
    ['Chia cinnamon oats', 'Turkey taco lettuce cups', 'Fish tacos with slaw'],
  ],
  American: [
    ['Cottage cheese toast', 'Turkey avocado salad', 'Grilled chicken sweet potato plate'],
    ['Spinach mushroom scramble', 'Bean and barley soup', 'Herb salmon with green beans'],
  ],
  Indian: [
    ['Vegetable upma with yogurt', 'Chana masala bowl', 'Tandoori salmon with spinach dal'],
    ['Besan chilla', 'Rajma brown rice', 'Chicken tikka with cucumber salad'],
  ],
};

function toggleValue(values, value) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function Chip({ active, label, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Metric({ label, value }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

async function analyzeMealPhoto(asset, restrictions) {
  await new Promise((resolve) => setTimeout(resolve, 900));

  const sizeSeed = Math.max(0, asset?.fileSize || asset?.width * asset?.height || 1);
  const sample = photoAnalysisSamples[sizeSeed % photoAnalysisSamples.length];
  const lowSodiumAdjustment = restrictions.includes('Low sodium') ? -90 : 0;

  return {
    ...sample,
    meal: 'Photo analysis',
    sodium: Math.max(90, sample.sodium + lowSodiumAdjustment),
    imageUri: asset.uri,
    analyzedAt: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
  };
}

async function apiRequest(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

async function apiUploadMealPhoto(token, asset, analysis) {
  const formData = new FormData();
  const fileName = asset.fileName || `meal-${Date.now()}.jpg`;
  const fileType = asset.mimeType || 'image/jpeg';

  formData.append('mealType', analysis.mealType);
  formData.append('nutrition', JSON.stringify(analysis));

  if (asset.file) {
    formData.append('photo', asset.file);
  } else {
    formData.append('photo', {
      uri: asset.uri,
      name: fileName,
      type: fileType,
    });
  }

  const response = await fetch(`${API_BASE_URL}/meals/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Photo upload failed');
  }

  return data;
}

async function apiAnalyzeMealPhoto(token, asset) {
  const formData = new FormData();
  const fileName = asset.fileName || `meal-${Date.now()}.jpg`;
  const fileType = asset.mimeType || 'image/jpeg';

  if (asset.file) {
    formData.append('photo', asset.file);
  } else {
    formData.append('photo', {
      uri: asset.uri,
      name: fileName,
      type: fileType,
    });
  }

  const response = await fetch(`${API_BASE_URL}/analysis/photo`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Photo analysis failed');
  }

  return data.analysis;
}

function toAppMeal(meal) {
  return {
    id: meal.id,
    name: meal.name,
    meal: meal.mealType ? meal.mealType[0].toUpperCase() + meal.mealType.slice(1) : 'Logged',
    mealType: meal.mealType,
    calories: meal.calories,
    protein: meal.protein,
    carbs: meal.carbs,
    fat: meal.fat,
    fiber: meal.fiber,
    sodium: meal.sodium,
    confidence: meal.confidence,
    notes: meal.notes,
    imageUri: meal.photoUrl,
    analyzedAt: meal.loggedAt
      ? new Date(meal.loggedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : null,
  };
}

function AuthScreen({ onDemo, onSignedIn }) {
  const [mode, setMode] = useState('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('Sign in with your email or phone number.');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setMessage(mode === 'login' ? 'Signing in...' : 'Creating account...');

    try {
      const cleanIdentifier = identifier.trim();
      const authBody =
        mode === 'login'
          ? { identifier: cleanIdentifier, password }
          : {
              email: cleanIdentifier.includes('@') ? cleanIdentifier : undefined,
              phone: cleanIdentifier.includes('@') ? undefined : cleanIdentifier,
              password,
            };
      const data = await apiRequest(mode === 'login' ? '/auth/login' : '/auth/register', {
        method: 'POST',
        body: authBody,
      });

      onSignedIn(data);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="dark" />
      <View style={styles.authScreen}>
        <Text style={styles.brand}>HealthyMealPlanner</Text>
        <Text style={styles.authSubtitle}>Save meals, nutrition estimates, and health goals.</Text>

        <View style={styles.authPanel}>
          <View style={styles.lengthSwitch}>
            {['login', 'register'].map((option) => (
              <Pressable
                key={option}
                onPress={() => {
                  setMode(option);
                  setMessage(
                    option === 'login'
                      ? 'Sign in with your email or phone number.'
                      : 'Create an account with email or phone.'
                  );
                }}
                style={[styles.lengthOption, mode === option && styles.lengthOptionActive]}
              >
                <Text
                  style={[
                    styles.lengthOptionText,
                    mode === option && styles.lengthOptionTextActive,
                  ]}
                >
                  {option === 'login' ? 'Login' : 'Register'}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Email or phone</Text>
          <TextInput
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@example.com or 5551234567"
            placeholderTextColor="#7a8a83"
            style={styles.input}
          />

          <Text style={styles.fieldLabel}>Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            placeholderTextColor="#7a8a83"
            secureTextEntry
            style={styles.input}
          />

          <Text style={styles.authMessage}>{message}</Text>

          <Pressable onPress={submit} style={styles.fullButton}>
            <Text style={styles.primaryButtonText}>
              {isSubmitting ? 'Please wait' : mode === 'login' ? 'Login' : 'Create account'}
            </Text>
          </Pressable>

          <Pressable onPress={onDemo} style={styles.demoButton}>
            <Text style={styles.demoButtonText}>Continue in demo mode</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  const [authToken, setAuthToken] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [apiStatus, setApiStatus] = useState('Not signed in');
  const [activeTab, setActiveTab] = useState('Today');
  const [foods, setFoods] = useState(defaultFoods);
  const [foodName, setFoodName] = useState('');
  const [selectedMealType, setSelectedMealType] = useState('breakfast');
  const [photoStatus, setPhotoStatus] = useState('Upload a plate photo for nutrient estimates.');
  const [photoPreview, setPhotoPreview] = useState(null);
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false);
  const [lastAnalysis, setLastAnalysis] = useState(null);
  const [selectedConcerns, setSelectedConcerns] = useState(['blood-pressure', 'diabetes']);
  const [cuisine, setCuisine] = useState('Mediterranean');
  const [restrictions, setRestrictions] = useState(['Low sodium']);
  const [avoidFoods, setAvoidFoods] = useState('shellfish, soda');
  const [planLength, setPlanLength] = useState('Weekly');

  const loadMeals = async (token) => {
    const data = await apiRequest('/meals', { token });
    setFoods(data.meals.map(toAppMeal));
  };

  const handleSignedIn = async ({ token, user }) => {
    setAuthToken(token);
    setCurrentUser(user);
    setApiStatus('Signed in and syncing meals');

    try {
      await loadMeals(token);
      setApiStatus('Meals synced with PostgreSQL');
    } catch (error) {
      setApiStatus(`Signed in, but meal sync failed: ${error.message}`);
    }
  };

  const continueDemoMode = () => {
    setAuthToken('demo');
    setCurrentUser({ email: 'demo@healthymealplanner.local' });
    setApiStatus('Demo mode, meals are stored only on this screen');
  };

  const saveProfile = async () => {
    if (!authToken || authToken === 'demo') {
      setApiStatus('Demo profile changes are stored only on this screen');
      return;
    }

    try {
      const foodsToAvoid = avoidFoods
        .split(',')
        .map((food) => food.trim())
        .filter(Boolean);
      const data = await apiRequest('/me/profile', {
        token: authToken,
        method: 'PUT',
        body: {
          healthConcerns: selectedConcerns,
          cuisinePreferences: [cuisine],
          dietaryRestrictions: restrictions,
          foodsToAvoid,
        },
      });

      setCurrentUser(data.user);
      setApiStatus('Profile saved to PostgreSQL');
    } catch (error) {
      setApiStatus(`Profile save failed: ${error.message}`);
    }
  };

  const activeConcerns = healthConcerns.filter((concern) => selectedConcerns.includes(concern.id));
  const recommendedFoods = useMemo(() => {
    const items = activeConcerns.flatMap((concern) => concern.foods);
    return [...new Set(items)].slice(0, 8);
  }, [activeConcerns]);

  const totals = foods.reduce(
    (sum, food) => ({
      calories: sum.calories + food.calories,
      protein: sum.protein + food.protein,
      carbs: sum.carbs + food.carbs,
      fat: sum.fat + food.fat,
      fiber: sum.fiber + food.fiber,
      sodium: sum.sodium + food.sodium,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0 }
  );

  const planDays = planLength === 'Weekly' ? 7 : 14;
  const plan = Array.from({ length: Math.min(planDays, 7) }, (_, index) => {
    const templates = mealTemplates[cuisine];
    const meals = templates[index % templates.length];
    return {
      day: `Day ${index + 1}`,
      meals,
      boost: recommendedFoods[index % Math.max(recommendedFoods.length, 1)] || 'Leafy greens',
    };
  });

  const addFood = () => {
    const name = foodName.trim();
    if (!name) return;
    const meal = {
      name,
      meal: selectedMealType[0].toUpperCase() + selectedMealType.slice(1),
      mealType: selectedMealType,
      calories: 280,
      protein: 14,
      carbs: 32,
      fat: 10,
      fiber: 5,
      sodium: restrictions.includes('Low sodium') ? 180 : 360,
    };

    setFoods([meal, ...foods]);
    setFoodName('');

    if (authToken && authToken !== 'demo') {
      apiRequest('/meals', {
        token: authToken,
        method: 'POST',
        body: meal,
      })
        .then(({ meal: savedMeal }) => {
          setFoods((currentFoods) => [toAppMeal(savedMeal), ...currentFoods.filter((item) => item !== meal)]);
          setApiStatus('Meal saved to PostgreSQL');
        })
        .catch((error) => setApiStatus(`Meal saved locally only: ${error.message}`));
    }
  };

  const addPhotoAnalysis = async () => {
    if (isAnalyzingPhoto) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Photo access needed',
        'Allow photo library access so HealthyMealPlanner can analyze a meal picture.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.85,
    });

    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    setPhotoPreview(asset.uri);
    setPhotoStatus('Analyzing photo and estimating nutrients...');
    setIsAnalyzingPhoto(true);

    try {
      const analysis =
        authToken && authToken !== 'demo'
          ? await apiAnalyzeMealPhoto(authToken, asset)
          : await analyzeMealPhoto(asset, restrictions);
      analysis.meal = selectedMealType[0].toUpperCase() + selectedMealType.slice(1);
      analysis.mealType = selectedMealType;
      setLastAnalysis(analysis);
      setFoods([analysis, ...foods]);
      setPhotoStatus(`${analysis.name.replace('Photo scan: ', '')} added with ${analysis.confidence.toLowerCase()} confidence.`);

      if (authToken && authToken !== 'demo') {
        apiUploadMealPhoto(authToken, asset, analysis)
          .then(({ meal: savedMeal }) => {
            setFoods((currentFoods) => [
              toAppMeal(savedMeal),
              ...currentFoods.filter((item) => item !== analysis),
            ]);
            setApiStatus('Photo meal saved to PostgreSQL');
          })
          .catch((error) => setApiStatus(`Photo meal saved locally only: ${error.message}`));
      }
    } catch (error) {
      setPhotoStatus('Unable to analyze this photo. Try another image or enter the meal manually.');
    } finally {
      setIsAnalyzingPhoto(false);
    }
  };

  if (!authToken) {
    return <AuthScreen onDemo={continueDemoMode} onSignedIn={handleSignedIn} />;
  }

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>HealthyMealPlanner</Text>
          <Text style={styles.subtitle}>
            {currentUser?.email || currentUser?.phone || 'Personal nutrition, meals, and reminders'}
          </Text>
        </View>
        <View style={styles.scoreBadge}>
          <Text style={styles.score}>82</Text>
          <Text style={styles.scoreLabel}>score</Text>
        </View>
      </View>
      <Text style={styles.syncStatus}>{apiStatus}</Text>

      <View style={styles.tabs}>
        {['Today', 'Planner', 'Profile'].map((tab) => (
          <Pressable
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {activeTab === 'Today' && (
          <>
            <View style={styles.metricsRow}>
              <Metric label="calories" value={totals.calories} />
              <Metric label="protein" value={`${totals.protein}g`} />
              <Metric label="fiber" value={`${totals.fiber}g`} />
            </View>

            <Section title="Log food">
              <View style={styles.mealTypeRow}>
                {mealTypeOptions.map((mealType) => (
                  <Chip
                    key={mealType}
                    label={mealType[0].toUpperCase() + mealType.slice(1)}
                    active={selectedMealType === mealType}
                    onPress={() => setSelectedMealType(mealType)}
                  />
                ))}
              </View>

              <View style={styles.inputRow}>
                <TextInput
                  value={foodName}
                  onChangeText={setFoodName}
                  placeholder="Food, meal, or snack"
                  placeholderTextColor="#7a8a83"
                  style={styles.input}
                />
                <Pressable onPress={addFood} style={styles.primaryButton}>
                  <Text style={styles.primaryButtonText}>Add</Text>
                </Pressable>
              </View>

              <Pressable
                onPress={addPhotoAnalysis}
                style={({ pressed }) => [
                  styles.photoButton,
                  isAnalyzingPhoto && styles.photoButtonDisabled,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.photoIcon}>
                  <Text style={styles.photoIconText}>{isAnalyzingPhoto ? '...' : '+'}</Text>
                </View>
                <View style={styles.photoCopy}>
                  <Text style={styles.photoTitle}>{isAnalyzingPhoto ? 'Analyzing meal photo' : 'Upload and analyze meal photo'}</Text>
                  <Text style={styles.photoText}>{photoStatus}</Text>
                </View>
              </Pressable>

              {photoPreview && (
                <View style={styles.analysisCard}>
                  <Image source={{ uri: photoPreview }} style={styles.photoPreview} />
                  <View style={styles.analysisBody}>
                    <Text style={styles.analysisTitle}>
                      {lastAnalysis ? lastAnalysis.name.replace('Photo scan: ', '') : 'Selected meal photo'}
                    </Text>
                    <Text style={styles.analysisText}>
                      {lastAnalysis ? lastAnalysis.notes : 'Waiting for nutrition estimate.'}
                    </Text>
                    {lastAnalysis && (
                      <View style={styles.nutritionGrid}>
                        <Text style={styles.nutritionPill}>{lastAnalysis.calories} cal</Text>
                        <Text style={styles.nutritionPill}>{lastAnalysis.carbs}g carbs</Text>
                        <Text style={styles.nutritionPill}>{lastAnalysis.fat}g fat</Text>
                        <Text style={styles.nutritionPill}>{lastAnalysis.sodium}mg sodium</Text>
                      </View>
                    )}
                  </View>
                </View>
              )}
            </Section>

            <Section title="Condition-friendly foods">
              <View style={styles.foodGrid}>
                {recommendedFoods.map((food) => (
                  <View key={food} style={styles.foodTile}>
                    <Text style={styles.foodTileText}>{food}</Text>
                  </View>
                ))}
              </View>
            </Section>

            <Section title="Today">
              {foods.map((food, index) => (
                <View key={`${food.name}-${index}`} style={styles.foodLogItem}>
                  <View style={styles.foodLogTop}>
                    <View style={styles.foodLogCopy}>
                      <Text style={styles.foodName}>{food.name}</Text>
                      <Text style={styles.foodMeta}>
                        {food.meal}
                        {food.analyzedAt ? ` at ${food.analyzedAt}` : ''}
                      </Text>
                    </View>
                    <Text style={styles.foodNumbers}>{food.calories} cal</Text>
                  </View>
                  <Text style={styles.foodDetail}>
                    {food.protein}g protein / {food.carbs}g carbs / {food.fat}g fat / {food.fiber}g fiber / {food.sodium}mg sodium
                  </Text>
                </View>
              ))}
            </Section>
          </>
        )}

        {activeTab === 'Planner' && (
          <>
            <Section title="Meal plan settings">
              <Text style={styles.fieldLabel}>Cuisine</Text>
              <View style={styles.wrapRow}>
                {cuisineOptions.map((option) => (
                  <Chip
                    key={option}
                    label={option}
                    active={cuisine === option}
                    onPress={() => setCuisine(option)}
                  />
                ))}
              </View>

              <Text style={styles.fieldLabel}>Dietary restrictions</Text>
              <View style={styles.wrapRow}>
                {restrictionOptions.map((option) => (
                  <Chip
                    key={option}
                    label={option}
                    active={restrictions.includes(option)}
                    onPress={() => setRestrictions(toggleValue(restrictions, option))}
                  />
                ))}
              </View>

              <View style={styles.lengthSwitch}>
                {['Weekly', 'Biweekly'].map((option) => (
                  <Pressable
                    key={option}
                    onPress={() => setPlanLength(option)}
                    style={[styles.lengthOption, planLength === option && styles.lengthOptionActive]}
                  >
                    <Text
                      style={[
                        styles.lengthOptionText,
                        planLength === option && styles.lengthOptionTextActive,
                      ]}
                    >
                      {option}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Foods to avoid</Text>
              <TextInput
                value={avoidFoods}
                onChangeText={setAvoidFoods}
                placeholder="Examples: peanuts, shellfish, soda"
                placeholderTextColor="#7a8a83"
                style={styles.input}
              />
            </Section>

            <Section title={`${planLength} plan`}>
              {plan.map((day) => (
                <View key={day.day} style={styles.planDay}>
                  <View style={styles.planHeader}>
                    <Text style={styles.planDayTitle}>{day.day}</Text>
                    <Text style={styles.boost}>Add {day.boost}</Text>
                  </View>
                  <Text style={styles.mealLine}>Breakfast: {day.meals[0]}</Text>
                  <Text style={styles.mealLine}>Lunch: {day.meals[1]}</Text>
                  <Text style={styles.mealLine}>Dinner: {day.meals[2]}</Text>
                </View>
              ))}
            </Section>
          </>
        )}

        {activeTab === 'Profile' && (
          <>
            <Section title="Health concerns">
              <View style={styles.wrapRow}>
                {healthConcerns.map((concern) => (
                  <Chip
                    key={concern.id}
                    label={concern.label}
                    active={selectedConcerns.includes(concern.id)}
                    onPress={() => setSelectedConcerns(toggleValue(selectedConcerns, concern.id))}
                  />
                ))}
              </View>
            </Section>

            <Section title="Nutrition focus">
              {activeConcerns.map((concern) => (
                <View key={concern.id} style={styles.focusRow}>
                  <Text style={styles.focusLabel}>{concern.label}</Text>
                  <Text style={styles.focusText}>{concern.focus}</Text>
                </View>
              ))}
            </Section>

            <Section title="Smart reminders">
              <View style={styles.reminder}>
                <Text style={styles.reminderTime}>10:30 AM</Text>
                <Text style={styles.reminderText}>Choose a high-fiber snack with water.</Text>
              </View>
              <View style={styles.reminder}>
                <Text style={styles.reminderTime}>1:00 PM</Text>
                <Text style={styles.reminderText}>Keep lunch low sodium and add leafy greens.</Text>
              </View>
              <View style={styles.reminder}>
                <Text style={styles.reminderTime}>6:30 PM</Text>
                <Text style={styles.reminderText}>Include calcium or omega-3 support at dinner.</Text>
              </View>
              <Pressable onPress={saveProfile} style={styles.fullButton}>
                <Text style={styles.primaryButtonText}>Save profile</Text>
              </Pressable>
            </Section>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: '#f6f7f2',
  },
  authScreen: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  authSubtitle: {
    color: '#61736b',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 6,
    marginBottom: 22,
  },
  authPanel: {
    backgroundColor: '#ffffff',
    borderColor: '#dce6d6',
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  authMessage: {
    color: '#60736b',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
    marginTop: 10,
  },
  fullButton: {
    alignItems: 'center',
    backgroundColor: '#176b56',
    borderRadius: 8,
    justifyContent: 'center',
    marginTop: 4,
    minHeight: 48,
    paddingHorizontal: 18,
  },
  demoButton: {
    alignItems: 'center',
    borderColor: '#ccd9d2',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 10,
    minHeight: 44,
  },
  demoButtonText: {
    color: '#176b56',
    fontSize: 14,
    fontWeight: '800',
  },
  header: {
    alignItems: 'center',
    backgroundColor: '#f6f7f2',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
  },
  brand: {
    color: '#18352e',
    fontSize: 26,
    fontWeight: '800',
  },
  subtitle: {
    color: '#61736b',
    fontSize: 14,
    marginTop: 3,
  },
  syncStatus: {
    color: '#60736b',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
    marginHorizontal: 20,
  },
  scoreBadge: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#dce6d6',
    borderRadius: 8,
    borderWidth: 1,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  score: {
    color: '#176b56',
    fontSize: 22,
    fontWeight: '800',
  },
  scoreLabel: {
    color: '#61736b',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  tabs: {
    backgroundColor: '#e7ece3',
    borderRadius: 8,
    flexDirection: 'row',
    marginHorizontal: 20,
    padding: 4,
  },
  tab: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    minHeight: 40,
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: '#ffffff',
  },
  tabText: {
    color: '#5d6d66',
    fontSize: 14,
    fontWeight: '700',
  },
  tabTextActive: {
    color: '#173a31',
  },
  content: {
    padding: 20,
    paddingBottom: 36,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  metric: {
    backgroundColor: '#ffffff',
    borderColor: '#e0e5dc',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    padding: 14,
  },
  metricValue: {
    color: '#18352e',
    fontSize: 20,
    fontWeight: '800',
  },
  metricLabel: {
    color: '#61736b',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#1b352f',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  mealTypeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#ccd9d2',
    borderRadius: 8,
    borderWidth: 1,
    color: '#18352e',
    flex: 1,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#176b56',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  photoButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d6e2da',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    padding: 14,
  },
  photoButtonDisabled: {
    opacity: 0.7,
  },
  photoIcon: {
    alignItems: 'center',
    backgroundColor: '#edf5ee',
    borderRadius: 8,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  photoIconText: {
    color: '#176b56',
    fontSize: 24,
    fontWeight: '700',
  },
  photoCopy: {
    flex: 1,
  },
  photoTitle: {
    color: '#18352e',
    fontSize: 15,
    fontWeight: '800',
  },
  photoText: {
    color: '#60736b',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  analysisCard: {
    backgroundColor: '#ffffff',
    borderColor: '#d6e2da',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    overflow: 'hidden',
  },
  photoPreview: {
    backgroundColor: '#e8eee8',
    height: 180,
    width: '100%',
  },
  analysisBody: {
    padding: 14,
  },
  analysisTitle: {
    color: '#18352e',
    fontSize: 16,
    fontWeight: '800',
  },
  analysisText: {
    color: '#60736b',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  nutritionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  nutritionPill: {
    backgroundColor: '#edf5ee',
    borderRadius: 8,
    color: '#176b56',
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  foodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  foodTile: {
    backgroundColor: '#ffffff',
    borderColor: '#dce6d6',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 12,
    width: '47%',
  },
  foodTileText: {
    color: '#244239',
    fontSize: 14,
    fontWeight: '700',
  },
  foodLogItem: {
    backgroundColor: '#ffffff',
    borderColor: '#e0e5dc',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
    padding: 14,
  },
  foodLogTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  foodLogCopy: {
    flex: 1,
  },
  foodName: {
    color: '#18352e',
    fontSize: 15,
    fontWeight: '800',
  },
  foodMeta: {
    color: '#6e7d77',
    fontSize: 13,
    marginTop: 2,
  },
  foodNumbers: {
    color: '#176b56',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
  },
  foodDetail: {
    color: '#60736b',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  fieldLabel: {
    color: '#485c54',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    marginBottom: 14,
  },
  chip: {
    backgroundColor: '#ffffff',
    borderColor: '#ccd9d2',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  chipActive: {
    backgroundColor: '#1d6b57',
    borderColor: '#1d6b57',
  },
  chipText: {
    color: '#365148',
    fontSize: 14,
    fontWeight: '700',
  },
  chipTextActive: {
    color: '#ffffff',
  },
  pressed: {
    opacity: 0.75,
  },
  lengthSwitch: {
    backgroundColor: '#e7ece3',
    borderRadius: 8,
    flexDirection: 'row',
    marginBottom: 14,
    padding: 4,
  },
  lengthOption: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    minHeight: 38,
    justifyContent: 'center',
  },
  lengthOptionActive: {
    backgroundColor: '#ffffff',
  },
  lengthOptionText: {
    color: '#61736b',
    fontSize: 14,
    fontWeight: '800',
  },
  lengthOptionTextActive: {
    color: '#18352e',
  },
  planDay: {
    backgroundColor: '#ffffff',
    borderColor: '#e0e5dc',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
    padding: 14,
  },
  planHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  planDayTitle: {
    color: '#18352e',
    fontSize: 16,
    fontWeight: '800',
  },
  boost: {
    color: '#176b56',
    fontSize: 12,
    fontWeight: '800',
  },
  mealLine: {
    color: '#485c54',
    fontSize: 14,
    lineHeight: 22,
  },
  focusRow: {
    backgroundColor: '#ffffff',
    borderColor: '#e0e5dc',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
    padding: 14,
  },
  focusLabel: {
    color: '#18352e',
    fontSize: 15,
    fontWeight: '800',
  },
  focusText: {
    color: '#60736b',
    fontSize: 14,
    marginTop: 3,
  },
  reminder: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e0e5dc',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
    padding: 14,
  },
  reminderTime: {
    color: '#176b56',
    fontSize: 13,
    fontWeight: '800',
    width: 76,
  },
  reminderText: {
    color: '#344e45',
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
});
