const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const axios = require('axios');
require('dotenv').config();

const app = express();
const User = require('./models/user');

// Middleware
app.use(cors({ origin: 'http://localhost:3000' })); // Ensure your frontend is running on localhost:3000
app.use(bodyParser.json()); // For parsing application/json

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('Connected to MongoDB database'))
  .catch(err => console.error('MongoDB connection error:', err));

// Gemini Chatbot API Integration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Function to format Gemini response with bold tags
const formatResponseWithBold = (text) => {
  // First, handle paired asterisks (for bold text)
  let formattedText = text.replace(/\*(.*?)\*/g, '<strong>$1</strong>');
  
  // Then, remove any remaining single asterisks
  formattedText = formattedText.replace(/\*/g, '');
  
  // Clean up any empty bold tags that might have been created
  formattedText = formattedText.replace(/<strong><\/strong>/g, '');
  
  return formattedText;
};

app.post('/generate-chatbot-response', async (req, res) => {
  const { message } = req.body;
  
  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
    
    // Add prompt engineering to discourage use of asterisks for formatting
    const enhancedMessage = `${message}\n\nPlease provide a clear response without using asterisks for formatting or bullet points.`;
    
    const geminiApiResponse = await axios({
      url: endpoint,
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        contents: [
          {
            parts: [
              {
                text: enhancedMessage,
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1000,
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
        ]
      }
    });

    let generatedResponse = geminiApiResponse.data.candidates[0].content.parts[0].text;
    generatedResponse = formatResponseWithBold(generatedResponse);

    res.json({ content: generatedResponse });
  } catch (error) {
    console.error('Error generating chatbot response:', error.response ? error.response.data : error.message);
    res.status(500).json({
      error: 'Error generating chatbot response',
      message: error.message,
      details: error.response ? error.response.data : null
    });
  }
});

// Authentication routes
// Sign Up Route
app.post('/api/signup', async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Create new user
    const user = new User({
      fullName,
      email,
      password
    });

    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Error creating user' });
  }
});

// Login Route
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Error during login' });
  }
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
