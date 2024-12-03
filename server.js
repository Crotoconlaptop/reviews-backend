const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const morgan = require('morgan');

const placesRoutes = require('./routes/places');

const app = express();
app.set('trust proxy', true);
// Middlewares
app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(cors());

// Rutas
app.use('/api/places', placesRoutes);

app.get('/', (req, res) => {
    res.send('Backend de Reseñas Anónimas funcionando correctamente');
});

// Servidor
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
