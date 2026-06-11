const db = require('../config/database');

const getAllRendezVous = async (req, res) => {
    const { date, statut, medecin_id } = req.query;
    
    try {
        let query = `
            SELECT r.*, 
                   p.nom as patient_nom, p.prenom as patient_prenom, p.telephone as patient_telephone,
                   u.nom as medecin_nom, m.specialite
            FROM rendez_vous r
            JOIN patients p ON r.patient_id = p.id
            JOIN medecins m ON r.medecin_id = m.id
            JOIN utilisateurs u ON m.utilisateur_id = u.id
            WHERE 1=1
        `;
        const params = [];

        if (date) {
            query += ' AND DATE(r.date_rdv) = ?';
            params.push(date);
        }

        if (statut) {
            query += ' AND r.statut = ?';
            params.push(statut);
        }

        if (medecin_id) {
            query += ' AND r.medecin_id = ?';
            params.push(medecin_id);
        }

        query += ' ORDER BY r.date_rdv ASC';

        const [rdvs] = await db.query(query, params);

        res.json({
            success: true,
            data: rdvs
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la récupération des rendez-vous.' 
        });
    }
};

const getRendezVousById = async (req, res) => {
    const { id } = req.params;

    try {
        const [rdvs] = await db.query(
            `SELECT r.*, 
                    p.nom as patient_nom, p.prenom as patient_prenom, p.telephone as patient_telephone,
                    u.nom as medecin_nom, m.specialite
             FROM rendez_vous r
             JOIN patients p ON r.patient_id = p.id
             JOIN medecins m ON r.medecin_id = m.id
             JOIN utilisateurs u ON m.utilisateur_id = u.id
             WHERE r.id = ?`,
            [id]
        );

        if (rdvs.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Rendez-vous non trouvé.' 
            });
        }

        res.json({
            success: true,
            data: rdvs[0]
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la récupération du rendez-vous.' 
        });
    }
};

const createRendezVous = async (req, res) => {
    const { patient_id, medecin_id, date_rdv, motif } = req.body;

    if (!patient_id || !medecin_id || !date_rdv) {
        return res.status(400).json({ 
            success: false, 
            message: 'Patient, médecin et date du rendez-vous requis.' 
        });
    }

    try {
        // Vérifier si le créneau est disponible
        const [existing] = await db.query(
            `SELECT id FROM rendez_vous 
             WHERE medecin_id = ? AND date_rdv = ? AND statut NOT IN ('ANNULE', 'TERMINE')`,
            [medecin_id, date_rdv]
        );

        if (existing.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Ce créneau est déjà pris.' 
            });
        }

        const [result] = await db.query(
            `INSERT INTO rendez_vous (patient_id, medecin_id, date_rdv, motif, statut) 
             VALUES (?, ?, ?, ?, 'EN_ATTENTE')`,
            [patient_id, medecin_id, date_rdv, motif]
        );

        const [newRdv] = await db.query(
            `SELECT r.*, 
                    p.nom as patient_nom, p.prenom as patient_prenom,
                    u.nom as medecin_nom
             FROM rendez_vous r
             JOIN patients p ON r.patient_id = p.id
             JOIN medecins m ON r.medecin_id = m.id
             JOIN utilisateurs u ON m.utilisateur_id = u.id
             WHERE r.id = ?`,
            [result.insertId]
        );

        res.status(201).json({
            success: true,
            data: newRdv[0]
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la création du rendez-vous.' 
        });
    }
};

const updateRendezVousStatus = async (req, res) => {
    const { id } = req.params;
    const { statut } = req.body;

    const validStatuts = ['EN_ATTENTE', 'CONFIRME', 'ANNULE', 'TERMINE'];
    
    if (!statut || !validStatuts.includes(statut)) {
        return res.status(400).json({ 
            success: false, 
            message: 'Statut invalide.' 
        });
    }

    try {
        const [result] = await db.query(
            'UPDATE rendez_vous SET statut = ? WHERE id = ?',
            [statut, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Rendez-vous non trouvé.' 
            });
        }

        res.json({
            success: true,
            message: 'Statut du rendez-vous mis à jour avec succès.'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la mise à jour du rendez-vous.' 
        });
    }
};

const deleteRendezVous = async (req, res) => {
    const { id } = req.params;

    try {
        const [result] = await db.query(
            'DELETE FROM rendez_vous WHERE id = ?',
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Rendez-vous non trouvé.' 
            });
        }

        res.json({
            success: true,
            message: 'Rendez-vous supprimé avec succès.'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la suppression du rendez-vous.' 
        });
    }
};

module.exports = {
    getAllRendezVous,
    getRendezVousById,
    createRendezVous,
    updateRendezVousStatus,
    deleteRendezVous
};