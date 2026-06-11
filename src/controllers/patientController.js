const db = require('../config/database');

// Obtenir tous les patients avec pagination
const getAllPatients = async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    try {
        let query = 'SELECT * FROM patients';
        let countQuery = 'SELECT COUNT(*) as total FROM patients';
        let params = [];

        if (search) {
            query += ' WHERE nom LIKE ? OR prenom LIKE ? OR telephone LIKE ?';
            countQuery += ' WHERE nom LIKE ? OR prenom LIKE ? OR telephone LIKE ?';
            const searchParam = `%${search}%`;
            params = [searchParam, searchParam, searchParam];
        }

        query += ' ORDER BY date_creation DESC LIMIT ? OFFSET ?';
        
        const [patients] = await db.query(query, [...params, limit, offset]);
        const [countResult] = await db.query(countQuery, params);
        
        const total = countResult[0].total;

        res.json({
            success: true,
            data: patients,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la récupération des patients.' 
        });
    }
};

// Obtenir un patient par ID
const getPatientById = async (req, res) => {
    const { id } = req.params;

    try {
        const [patients] = await db.query(
            `SELECT p.*, 
                    dm.taille, dm.poids, dm.observations_generales,
                    pa.assurance_id, pa.numero_police, a.nom as assurance_nom, a.taux_couverture
             FROM patients p
             LEFT JOIN dossiers_medicaux dm ON p.id = dm.patient_id
             LEFT JOIN patients_assurances pa ON p.id = pa.patient_id
             LEFT JOIN assurances a ON pa.assurance_id = a.id
             WHERE p.id = ?`,
            [id]
        );

        if (patients.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Patient non trouvé.' 
            });
        }

        // Récupérer les consultations du patient
        const [consultations] = await db.query(
            `SELECT c.*, m.specialite, u.nom as medecin_nom
             FROM consultations c
             JOIN medecins m ON c.medecin_id = m.id
             JOIN utilisateurs u ON m.utilisateur_id = u.id
             WHERE c.patient_id = ?
             ORDER BY c.date_consultation DESC
             LIMIT 5`,
            [id]
        );

        const patient = patients[0];
        patient.consultations_recentes = consultations;

        res.json({
            success: true,
            data: patient
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la récupération du patient.' 
        });
    }
};

// Créer un nouveau patient
const createPatient = async (req, res) => {
    const {
        nom, prenom, sexe, date_naissance,
        telephone, adresse, groupe_sanguin, antecedents
    } = req.body;

    if (!nom || !prenom) {
        return res.status(400).json({ 
            success: false, 
            message: 'Le nom et le prénom sont requis.' 
        });
    }

    try {
        const [result] = await db.query(
            `INSERT INTO patients 
             (nom, prenom, sexe, date_naissance, telephone, adresse, groupe_sanguin, antecedents) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [nom, prenom, sexe, date_naissance, telephone, adresse, groupe_sanguin, antecedents]
        );

        const [newPatient] = await db.query(
            'SELECT * FROM patients WHERE id = ?',
            [result.insertId]
        );

        res.status(201).json({
            success: true,
            data: newPatient[0]
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la création du patient.' 
        });
    }
};

// Mettre à jour un patient
const updatePatient = async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    try {
        const [existing] = await db.query(
            'SELECT id FROM patients WHERE id = ?',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Patient non trouvé.' 
            });
        }

        const fields = [];
        const values = [];

        for (const [key, value] of Object.entries(updates)) {
            if (value !== undefined) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }

        if (fields.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Aucune donnée à mettre à jour.' 
            });
        }

        values.push(id);
        await db.query(
            `UPDATE patients SET ${fields.join(', ')} WHERE id = ?`,
            values
        );

        const [updatedPatient] = await db.query(
            'SELECT * FROM patients WHERE id = ?',
            [id]
        );

        res.json({
            success: true,
            data: updatedPatient[0]
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la mise à jour du patient.' 
        });
    }
};

// Supprimer un patient
const deletePatient = async (req, res) => {
    const { id } = req.params;

    try {
        const [result] = await db.query(
            'DELETE FROM patients WHERE id = ?',
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Patient non trouvé.' 
            });
        }

        res.json({
            success: true,
            message: 'Patient supprimé avec succès.'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la suppression du patient.' 
        });
    }
};

module.exports = {
    getAllPatients,
    getPatientById,
    createPatient,
    updatePatient,
    deletePatient
};