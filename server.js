const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const apiRoutes = require('./src/routes/api');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware de base
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logger simple
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Route de test avant les routes API
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'API Clinique fonctionnelle',
        timestamp: new Date().toISOString()
    });
});

// Routes API (avec leurs propres middlewares)
app.use('/api/v1', apiRoutes);

// Gestion des erreurs 404
app.use((req, res) => {
    res.status(404).json({ 
        success: false, 
        message: 'Route non trouvée' 
    });
});

// Gestion globale des erreurs
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        success: false, 
        message: 'Erreur interne du serveur' 
    });
});

// Démarrage du serveur
app.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
    console.log(`📝 Documentation API: http://localhost:${PORT}/health`);
});