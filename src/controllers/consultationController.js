const db = require('../config/database');

const getAllConsultations = async (req, res) => {
    const { patient_id, medecin_id, date_debut, date_fin } = req.query;
    
    try {
        let query = `
            SELECT c.*, 
                   p.nom as patient_nom, p.prenom as patient_prenom,
                   u.nom as medecin_nom, m.specialite
            FROM consultations c
            JOIN patients p ON c.patient_id = p.id
            JOIN medecins m ON c.medecin_id = m.id
            JOIN utilisateurs u ON m.utilisateur_id = u.id
            WHERE 1=1
        `;
        const params = [];

        if (patient_id) {
            query += ' AND c.patient_id = ?';
            params.push(patient_id);
        }

        if (medecin_id) {
            query += ' AND c.medecin_id = ?';
            params.push(medecin_id);
        }

        if (date_debut) {
            query += ' AND DATE(c.date_consultation) >= ?';
            params.push(date_debut);
        }

        if (date_fin) {
            query += ' AND DATE(c.date_consultation) <= ?';
            params.push(date_fin);
        }

        query += ' ORDER BY c.date_consultation DESC';

        const [consultations] = await db.query(query, params);

        res.json({
            success: true,
            data: consultations
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la récupération des consultations.' 
        });
    }
};

const getConsultationById = async (req, res) => {
    const { id } = req.params;

    try {
        const [consultations] = await db.query(
            `SELECT c.*, 
                    p.nom as patient_nom, p.prenom as patient_prenom,
                    u.nom as medecin_nom, m.specialite
             FROM consultations c
             JOIN patients p ON c.patient_id = p.id
             JOIN medecins m ON c.medecin_id = m.id
             JOIN utilisateurs u ON m.utilisateur_id = u.id
             WHERE c.id = ?`,
            [id]
        );

        if (consultations.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Consultation non trouvée.' 
            });
        }

        // Récupérer les examens associés
        const [examens] = await db.query(
            'SELECT * FROM examens WHERE consultation_id = ?',
            [id]
        );

        // Récupérer l'ordonnance
        const [ordonnances] = await db.query(
            `SELECT o.*, om.medicament, om.dosage, om.duree
             FROM ordonnances o
             LEFT JOIN ordonnance_medicaments om ON o.id = om.ordonnance_id
             WHERE o.consultation_id = ?`,
            [id]
        );

        const consultation = consultations[0];
        consultation.examens = examens;
        consultation.ordonnances = ordonnances;

        res.json({
            success: true,
            data: consultation
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la récupération de la consultation.' 
        });
    }
};

const createConsultation = async (req, res) => {
    const { patient_id, medecin_id, rendez_vous_id, motif, diagnostic, traitement, observations } = req.body;

    if (!patient_id || !medecin_id) {
        return res.status(400).json({ 
            success: false, 
            message: 'Patient et médecin requis.' 
        });
    }

    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();

        const [result] = await connection.query(
            `INSERT INTO consultations 
             (patient_id, medecin_id, rendez_vous_id, motif, diagnostic, traitement, observations) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [patient_id, medecin_id, rendez_vous_id, motif, diagnostic, traitement, observations]
        );

        // Si le rendez-vous existe, le marquer comme terminé
        if (rendez_vous_id) {
            await connection.query(
                'UPDATE rendez_vous SET statut = "TERMINE" WHERE id = ?',
                [rendez_vous_id]
            );
        }

        await connection.commit();

        const [newConsultation] = await connection.query(
            `SELECT c.*, 
                    p.nom as patient_nom, p.prenom as patient_prenom,
                    u.nom as medecin_nom
             FROM consultations c
             JOIN patients p ON c.patient_id = p.id
             JOIN medecins m ON c.medecin_id = m.id
             JOIN utilisateurs u ON m.utilisateur_id = u.id
             WHERE c.id = ?`,
            [result.insertId]
        );

        res.status(201).json({
            success: true,
            data: newConsultation[0]
        });
    } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la création de la consultation.' 
        });
    } finally {
        connection.release();
    }
};

const updateConsultation = async (req, res) => {
    const { id } = req.params;
    const { motif, diagnostic, traitement, observations } = req.body;

    try {
        const [existing] = await db.query(
            'SELECT id FROM consultations WHERE id = ?',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Consultation non trouvée.' 
            });
        }

        await db.query(
            `UPDATE consultations 
             SET motif = ?, diagnostic = ?, traitement = ?, observations = ?
             WHERE id = ?`,
            [motif, diagnostic, traitement, observations, id]
        );

        const [updatedConsultation] = await db.query(
            'SELECT * FROM consultations WHERE id = ?',
            [id]
        );

        res.json({
            success: true,
            data: updatedConsultation[0]
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la mise à jour de la consultation.' 
        });
    }
};

module.exports = {
    getAllConsultations,
    getConsultationById,
    createConsultation,
    updateConsultation
};