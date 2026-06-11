const db = require('../config/database');
const bcrypt = require('bcryptjs');

const getAllUsers = async (req, res) => {
    const { search, role, statut } = req.query;
    
    try {
        let query = 'SELECT id, nom, email, role, statut, date_creation FROM utilisateurs WHERE 1=1';
        const params = [];

        if (search) {
            query += ' AND (nom LIKE ? OR email LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }
        if (role) {
            query += ' AND role = ?';
            params.push(role);
        }
        if (statut) {
            query += ' AND statut = ?';
            params.push(statut);
        }

        query += ' ORDER BY date_creation DESC';
        
        const [users] = await db.query(query, params);
        res.json({ success: true, data: users });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Erreur lors de la récupération' });
    }
};

const getUserById = async (req, res) => {
    const { id } = req.params;
    try {
        const [users] = await db.query(
            'SELECT id, nom, email, role, statut, date_creation FROM utilisateurs WHERE id = ?',
            [id]
        );
        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
        }
        res.json({ success: true, data: users[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erreur lors de la récupération' });
    }
};

const createUser = async (req, res) => {
    const { nom, email, mot_de_passe, role } = req.body;

    if (!nom || !email || !mot_de_passe) {
        return res.status(400).json({ success: false, message: 'Nom, email et mot de passe requis' });
    }

    try {
        const [existing] = await db.query('SELECT id FROM utilisateurs WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'Cet email existe déjà' });
        }

        const hashedPassword = await bcrypt.hash(mot_de_passe, 10);
        const [result] = await db.query(
            'INSERT INTO utilisateurs (nom, email, mot_de_passe, role, statut) VALUES (?, ?, ?, ?, "ACTIF")',
            [nom, email, hashedPassword, role || 'RECEPTIONNISTE']
        );

        res.status(201).json({ success: true, message: 'Utilisateur créé', data: { id: result.insertId } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erreur lors de la création' });
    }
};

const updateUser = async (req, res) => {
    const { id } = req.params;
    const { nom, email, role, statut, mot_de_passe } = req.body;

    try {
        let query = 'UPDATE utilisateurs SET nom = ?, email = ?, role = ?, statut = ?';
        const params = [nom, email, role, statut];

        if (mot_de_passe) {
            const hashedPassword = await bcrypt.hash(mot_de_passe, 10);
            query += ', mot_de_passe = ?';
            params.push(hashedPassword);
        }

        query += ' WHERE id = ?';
        params.push(id);

        await db.query(query, params);
        res.json({ success: true, message: 'Utilisateur mis à jour' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erreur lors de la mise à jour' });
    }
};

const deleteUser = async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM utilisateurs WHERE id = ?', [id]);
        res.json({ success: true, message: 'Utilisateur supprimé' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erreur lors de la suppression' });
    }
};

const changeUserStatus = async (req, res) => {
    const { id } = req.params;
    const { statut } = req.body;
    try {
        await db.query('UPDATE utilisateurs SET statut = ? WHERE id = ?', [statut, id]);
        res.json({ success: true, message: 'Statut mis à jour' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erreur lors du changement de statut' });
    }
};

module.exports = { getAllUsers, getUserById, createUser, updateUser, deleteUser, changeUserStatus };