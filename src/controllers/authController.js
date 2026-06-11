const db = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const login = async (req, res) => {
    const { email, mot_de_passe } = req.body;

    if (!email || !mot_de_passe) {
        return res.status(400).json({ 
            success: false, 
            message: 'Email et mot de passe requis.' 
        });
    }

    try {
        const [users] = await db.query(
            'SELECT id, nom, email, mot_de_passe, role, statut FROM utilisateurs WHERE email = ?',
            [email]
        );

        if (users.length === 0) {
            return res.status(401).json({ 
                success: false, 
                message: 'Email ou mot de passe incorrect.' 
            });
        }

        const user = users[0];
        
        if (user.statut !== 'ACTIF') {
            return res.status(401).json({ 
                success: false, 
                message: 'Compte désactivé. Contactez l\'administrateur.' 
            });
        }

        const isValidPassword = await bcrypt.compare(mot_de_passe, user.mot_de_passe);
        
        if (!isValidPassword) {
            return res.status(401).json({ 
                success: false, 
                message: 'Email ou mot de passe incorrect.' 
            });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE }
        );

        res.json({
            success: true,
            data: {
                token,
                user: {
                    id: user.id,
                    nom: user.nom,
                    email: user.email,
                    role: user.role
                }
            }
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la connexion.' 
        });
    }
};

const register = async (req, res) => {
    const { nom, email, mot_de_passe, role } = req.body;

    if (!nom || !email || !mot_de_passe) {
        return res.status(400).json({ 
            success: false, 
            message: 'Nom, email et mot de passe requis.' 
        });
    }

    try {
        const [existing] = await db.query(
            'SELECT id FROM utilisateurs WHERE email = ?',
            [email]
        );

        if (existing.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Cet email est déjà utilisé.' 
            });
        }

        const hashedPassword = await bcrypt.hash(mot_de_passe, 10);
        const userRole = role || 'RECEPTIONNISTE';

        const [result] = await db.query(
            'INSERT INTO utilisateurs (nom, email, mot_de_passe, role, statut) VALUES (?, ?, ?, ?, "ACTIF")',
            [nom, email, hashedPassword, userRole]
        );

        const token = jwt.sign(
            { id: result.insertId, email, role: userRole },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE }
        );

        res.status(201).json({
            success: true,
            data: {
                token,
                user: {
                    id: result.insertId,
                    nom,
                    email,
                    role: userRole
                }
            }
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de l\'inscription.' 
        });
    }
};

const getProfile = async (req, res) => {
    try {
        const [users] = await db.query(
            'SELECT id, nom, email, role, statut, date_creation FROM utilisateurs WHERE id = ?',
            [req.user.id]
        );

        if (users.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Utilisateur non trouvé.' 
            });
        }

        res.json({
            success: true,
            data: users[0]
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la récupération du profil.' 
        });
    }
};

module.exports = { login, register, getProfile };