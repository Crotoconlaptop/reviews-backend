const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const placesDataPath = path.join(__dirname, '../data/places.json');
let placesData = fs.existsSync(placesDataPath) ? require(placesDataPath) : [];

// Function to save data to the JSON file
const savePlacesData = () => {
    fs.writeFileSync(placesDataPath, JSON.stringify(placesData, null, 2));
};

// Function to hash IPs
const hashIP = (ip) => crypto.createHash('sha256').update(ip).digest('hex');

// List of category names
const categoryNames = [
    'HR',
    'FRONT DESK',
    'FOOD&BEVERAGE',
    'HOUSEKEEPING',
    'LAUNDRY',
    'LP',
    'MARKETING',
    'EMPLOYEE DINING ROOM',
    'QUALITY OF THE GUEST',
    'HONESTY',
    'DISCRIMINATION',
    'ANIMAL ABUSE',
    'ACCOMMODATION'
];

// Category weights
const weights = {
    10: 2, // DISCRIMINATION
    11: 2, // ANIMAL ABUSE
    12: 2, // ACCOMMODATION
};

// **Routes**
// 1. Add a new place
router.post('/add', (req, res) => {
    const { name, city, address } = req.body;

    if (!name || !city || !address) {
        return res.status(400).json({ error: 'Name, city, and address are required' });
    }

    const normalizedName = name.trim().toLowerCase();
    const normalizedCity = city.trim().toLowerCase();
    const normalizedAddress = address.trim().toLowerCase();

    const existingPlace = placesData.find(
        (place) =>
            place.name.trim().toLowerCase() === normalizedName &&
            place.city.trim().toLowerCase() === normalizedCity &&
            place.address.trim().toLowerCase() === normalizedAddress
    );

    if (existingPlace) {
        return res.status(200).json({ message: 'The place already exists', place: existingPlace });
    }

    const newPlace = {
        id: crypto.randomUUID(),
        name: name.trim(),
        city: city.trim(),
        address: address.trim(),
        ratings: [], // Ratings with omitted categories represented as `null`
        averageRating: 0,
    };

    placesData.push(newPlace);
    savePlacesData();
    res.status(201).json({ message: 'Place added successfully', place: newPlace });
});

// 2. Submit a rating
router.post('/rate', (req, res) => {
    const { id, ratings } = req.body;
    const userIP = hashIP(req.ip);

    const place = placesData.find((place) => place.id === id);
    if (!place) {
        return res.status(404).json({ error: 'Place not found' });
    }

    if (!Array.isArray(ratings) || ratings.some((r) => r !== null && (isNaN(r) || r < 1 || r > 5))) {
        return res.status(400).json({ error: 'Ratings must be numbers between 1 and 5 or null for omitted categories.' });
    }

    const now = new Date();
    const threeMonthsAgo = new Date(now.setMonth(now.getMonth() - 3));

    // Check if the user has voted in the last 3 months
    const recentVote = place.ratings.some(
        (vote) => vote.userIP === userIP && new Date(vote.date) >= threeMonthsAgo
    );

    if (recentVote) {
        return res.status(403).json({ error: 'You can only vote once every 3 months for this place.' });
    }

    // Add the rating
    place.ratings.push({ userIP, ratings, date: new Date() });

    // Calculate average rating considering omitted categories
    const totalWeightedScore = place.ratings.flatMap((vote) =>
        vote.ratings.map((value, index) => (value !== null ? value * (weights[index] || 1) : 0))
    ).reduce((sum, weightedValue) => sum + weightedValue, 0);

    const totalWeights = place.ratings.flatMap((vote) =>
        vote.ratings.map((value, index) => (value !== null ? (weights[index] || 1) : 0))
    ).reduce((sum, weight) => sum + weight, 0);

    place.averageRating = totalWeights > 0 ? (totalWeightedScore / totalWeights).toFixed(2) : 'No ratings';

    savePlacesData();
    res.json({ message: 'Rating saved successfully', place });
});


// 3. Get rankings
router.get('/ranking', (req, res) => {
    const sortedPlaces = [...placesData].sort((a, b) => b.averageRating - a.averageRating);
    const topPlaces = sortedPlaces.slice(0, 5);
    const bottomPlaces = sortedPlaces.slice(-5).reverse();
    res.json({ topPlaces, bottomPlaces });
});

// 4. Get place details
router.get('/:id', (req, res) => {
    const { id } = req.params;
    const place = placesData.find((place) => place.id === id);

    if (!place) {
        return res.status(404).json({ error: 'Place not found' });
    }

    const totalVotes = place.ratings.length;

    const averagesByCategory = place.ratings.length > 0
        ? categoryNames.map((name, i) => {
              const categoryRatings = place.ratings.map((vote) => vote.ratings[i]).filter((r) => r !== null);
              const average = categoryRatings.length > 0
                  ? (categoryRatings.reduce((sum, value) => sum + value, 0) / categoryRatings.length).toFixed(1)
                  : 'No ratings';
              return { category: name, average };
          })
        : [];

    res.json({ place, averagesByCategory, totalVotes });
});

module.exports = router;
