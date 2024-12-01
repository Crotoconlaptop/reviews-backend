const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const placesDataPath = path.join(__dirname, '../data/places.json');
let placesData = fs.existsSync(placesDataPath) ? require(placesDataPath) : [];

// Función para guardar datos en el archivo JSON
const savePlacesData = () => {
    fs.writeFileSync(placesDataPath, JSON.stringify(placesData, null, 2));
};

// Función para cifrar IPs
const hashIP = (ip) => crypto.createHash('sha256').update(ip).digest('hex');

// Lista de nombres de categorías
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

// Pesos para las categorías
const weights = {
    10: 2, // DISCRIMINATION
    11: 2, // ANIMAL ABUSE
    12: 2, // ACCOMMODATION
};

// **Rutas**

// 1. Agregar un nuevo lugar
router.post('/add', (req, res) => {
    const { name, city, address } = req.body;

    if (!name || !city || !address) {
        return res.status(400).json({ error: 'Nombre, ciudad y dirección son obligatorios' });
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
        return res.status(200).json({ message: 'El lugar ya existe', place: existingPlace });
    }

    const newPlace = {
        id: crypto.randomUUID(),
        name: name.trim(),
        city: city.trim(),
        address: address.trim(),
        ratings: [], // Contendrá votaciones con categorías omitidas representadas como `null`
        averageRating: 0,
    };

    placesData.push(newPlace);
    savePlacesData();
    res.status(201).json({ message: 'Lugar agregado exitosamente', place: newPlace });
});

// 2. Enviar votación
router.post('/rate', (req, res) => {
    const { id, ratings } = req.body;
    const userIP = hashIP(req.ip);

    const place = placesData.find((place) => place.id === id);
    if (!place) {
        return res.status(404).json({ error: 'Lugar no encontrado' });
    }

    if (!Array.isArray(ratings) || ratings.some((r) => r !== null && (isNaN(r) || r < 1 || r > 5))) {
        return res.status(400).json({ error: 'Las calificaciones deben ser números entre 1 y 5 o null para categorías omitidas.' });
    }

    const now = new Date();
    const threeMonthsAgo = new Date(now.setMonth(now.getMonth() - 3));

    const recentVote = place.ratings.some(
        (vote) => vote.userIP === userIP && new Date(vote.date) >= threeMonthsAgo
    );

    if (recentVote) {
        return res.status(403).json({ error: 'Solo puedes votar una vez cada 3 meses para este lugar.' });
    }

    place.ratings.push({ userIP, ratings, date: new Date() });

    // Calcular promedio considerando categorías omitidas
    const totalWeightedScore = place.ratings.flatMap((vote) =>
        vote.ratings.map((value, index) => (value !== null ? value * (weights[index] || 1) : 0))
    ).reduce((sum, weightedValue) => sum + weightedValue, 0);

    const totalWeights = place.ratings.flatMap((vote) =>
        vote.ratings.map((value, index) => (value !== null ? (weights[index] || 1) : 0))
    ).reduce((sum, weight) => sum + weight, 0);

    place.averageRating = totalWeights > 0 ? (totalWeightedScore / totalWeights).toFixed(2) : 'Sin calificaciones';

    savePlacesData();
    res.json({ message: 'Votación guardada exitosamente', place });
});

// 3. Obtener listas de ranking
router.get('/ranking', (req, res) => {
    const sortedPlaces = [...placesData].sort((a, b) => b.averageRating - a.averageRating);
    const topPlaces = sortedPlaces.slice(0, 5);
    const bottomPlaces = sortedPlaces.slice(-5).reverse();
    res.json({ topPlaces, bottomPlaces });
});

// 4. Detalles de un lugar
router.get('/:id', (req, res) => {
    const { id } = req.params;
    const place = placesData.find((place) => place.id === id);

    if (!place) {
        return res.status(404).json({ error: 'Lugar no encontrado' });
    }

    const totalVotes = place.ratings.length;

    const averagesByCategory = place.ratings.length > 0
        ? categoryNames.map((name, i) => {
              const categoryRatings = place.ratings.map((vote) => vote.ratings[i]).filter((r) => r !== null);
              const average = categoryRatings.length > 0
                  ? (categoryRatings.reduce((sum, value) => sum + value, 0) / categoryRatings.length).toFixed(1)
                  : 'Sin calificaciones';
              return { category: name, average };
          })
        : [];

    res.json({ place, averagesByCategory, totalVotes });
});

module.exports = router;
