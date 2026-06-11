const jwt = require('jsonwebtoken');
const db = require('../config/database');

const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ 
            success: false, 
            message: 'Token manquant.' 
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Vérifier si l'utilisateur existe toujours
        const [users] = await db.query(
            'SELECT id, nom, email, role, statut FROM utilisateurs WHERE id = ?',
            [decoded.id]
        );
        
        if (users.length === 0) {
            return res.status(401).json({ 
                success: false, 
                message: 'Utilisateur non trouvé.' 
            });
        }
        
        if (users[0].statut !== 'ACTIF') {
            return res.status(401).json({ 
                success: false, 
                message: 'Compte utilisateur désactivé.' 
            });
        }
        
        req.user = users[0];
        next();
    } catch (error) {
        return res.status(403).json({ 
            success: false, 
            message: 'Token invalide ou expiré.' 
        });
    }
};

const authorizeRoles = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Non authentifié.' 
            });
        }
        
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ 
                success: false, 
                message: 'Accès interdit. Vous n\'avez pas les permissions nécessaires.' 
            });
        }
        
        next();
    };
};

module.exports = { authenticateToken, authorizeRoles };