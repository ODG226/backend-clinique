const db = require('../config/database');

// Obtenir toutes les factures
const getAllFactures = async (req, res) => {
    const { patient_id, statut, date_debut, date_fin } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    try {
        let query = `
            SELECT f.*, 
                   p.nom as patient_nom, p.prenom as patient_prenom,
                   COALESCE(SUM(pmt.montant), 0) as montant_paye,
                   (f.montant_total - COALESCE(SUM(pmt.montant), 0)) as solde_restant
            FROM factures f
            JOIN patients p ON f.patient_id = p.id
            LEFT JOIN paiements pmt ON f.id = pmt.facture_id
            WHERE 1=1
        `;
        const params = [];

        if (patient_id) {
            query += ' AND f.patient_id = ?';
            params.push(patient_id);
        }

        if (statut) {
            query += ' AND f.statut = ?';
            params.push(statut);
        }

        if (date_debut) {
            query += ' AND f.date_facture >= ?';
            params.push(date_debut);
        }

        if (date_fin) {
            query += ' AND f.date_facture <= ?';
            params.push(date_fin);
        }

        query += ' GROUP BY f.id ORDER BY f.date_facture DESC LIMIT ? OFFSET ?';
        
        const [factures] = await db.query(query, [...params, limit, offset]);
        
        // Récupérer le total
        const [totalResult] = await db.query(
            'SELECT COUNT(*) as total FROM factures',
            []
        );

        res.json({
            success: true,
            data: factures,
            pagination: {
                page,
                limit,
                total: totalResult[0].total,
                totalPages: Math.ceil(totalResult[0].total / limit)
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la récupération des factures.' 
        });
    }
};

// Obtenir une facture par ID
const getFactureById = async (req, res) => {
    const { id } = req.params;

    try {
        const [factures] = await db.query(
            `SELECT f.*, 
                    p.nom as patient_nom, p.prenom as patient_prenom, p.telephone, p.adresse
             FROM factures f
             JOIN patients p ON f.patient_id = p.id
             WHERE f.id = ?`,
            [id]
        );

        if (factures.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Facture non trouvée.' 
            });
        }

        // Récupérer les lignes de facture
        const [lignes] = await db.query(
            `SELECT * FROM lignes_facture WHERE facture_id = ?`,
            [id]
        );

        // Récupérer les paiements
        const [paiements] = await db.query(
            `SELECT * FROM paiements WHERE facture_id = ? ORDER BY date_paiement DESC`,
            [id]
        );

        const facture = factures[0];
        facture.lignes = lignes;
        facture.paiements = paiements;
        facture.montant_paye = paiements.reduce((sum, p) => sum + parseFloat(p.montant), 0);
        facture.solde_restant = facture.montant_total - facture.montant_paye;

        res.json({
            success: true,
            data: facture
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la récupération de la facture.' 
        });
    }
};

// Créer une nouvelle facture
const createFacture = async (req, res) => {
    const { patient_id, lignes } = req.body;

    if (!patient_id || !lignes || lignes.length === 0) {
        return res.status(400).json({ 
            success: false, 
            message: 'Patient et lignes de facture requis.' 
        });
    }

    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();

        // Calculer le montant total
        const montant_total = lignes.reduce((sum, ligne) => 
            sum + (ligne.prix_unitaire * ligne.quantite), 0);

        // Créer la facture
        const [factureResult] = await connection.query(
            `INSERT INTO factures (patient_id, date_facture, montant_total, statut)
             VALUES (?, CURDATE(), ?, 'NON_PAYEE')`,
            [patient_id, montant_total]
        );

        // Ajouter les lignes de facture
        for (const ligne of lignes) {
            await connection.query(
                `INSERT INTO lignes_facture (facture_id, description, quantite, prix_unitaire)
                 VALUES (?, ?, ?, ?)`,
                [factureResult.insertId, ligne.description, ligne.quantite, ligne.prix_unitaire]
            );
        }

        await connection.commit();

        const [newFacture] = await db.query(
            `SELECT f.*, p.nom as patient_nom, p.prenom as patient_prenom
             FROM factures f
             JOIN patients p ON f.patient_id = p.id
             WHERE f.id = ?`,
            [factureResult.insertId]
        );

        res.status(201).json({
            success: true,
            data: newFacture[0]
        });
    } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la création de la facture.' 
        });
    } finally {
        connection.release();
    }
};

// Ajouter un paiement
const addPaiement = async (req, res) => {
    const { id } = req.params;
    const { montant, mode_paiement } = req.body;

    if (!montant || montant <= 0) {
        return res.status(400).json({ 
            success: false, 
            message: 'Montant valide requis.' 
        });
    }

    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();

        // Vérifier la facture
        const [factures] = await connection.query(
            'SELECT * FROM factures WHERE id = ?',
            [id]
        );

        if (factures.length === 0) {
            await connection.rollback();
            return res.status(404).json({ 
                success: false, 
                message: 'Facture non trouvée.' 
            });
        }

        const facture = factures[0];
        
        // Calculer le total déjà payé
        const [paiementsExistants] = await connection.query(
            'SELECT SUM(montant) as total FROM paiements WHERE facture_id = ?',
            [id]
        );
        
        const totalPaye = paiementsExistants[0].total || 0;
        const nouveauTotal = totalPaye + montant;
        
        if (nouveauTotal > facture.montant_total) {
            await connection.rollback();
            return res.status(400).json({ 
                success: false, 
                message: 'Le montant dépasse le solde restant.' 
            });
        }

        // Ajouter le paiement
        await connection.query(
            `INSERT INTO paiements (facture_id, date_paiement, montant, mode_paiement)
             VALUES (?, NOW(), ?, ?)`,
            [id, montant, mode_paiement]
        );

        // Mettre à jour le statut de la facture
        let nouveauStatut = 'PARTIELLEMENT_PAYEE';
        if (nouveauTotal === facture.montant_total) {
            nouveauStatut = 'PAYEE';
        }
        
        await connection.query(
            'UPDATE factures SET statut = ? WHERE id = ?',
            [nouveauStatut, id]
        );

        await connection.commit();

        res.json({
            success: true,
            message: 'Paiement enregistré avec succès.',
            data: {
                montant_paye: montant,
                total_paye: nouveauTotal,
                solde_restant: facture.montant_total - nouveauTotal,
                statut_facture: nouveauStatut
            }
        });
    } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de l\'enregistrement du paiement.' 
        });
    } finally {
        connection.release();
    }
};

// Annuler une facture
const annulerFacture = async (req, res) => {
    const { id } = req.params;

    try {
        const [factures] = await db.query(
            'SELECT statut FROM factures WHERE id = ?',
            [id]
        );

        if (factures.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Facture non trouvée.' 
            });
        }

        if (factures[0].statut === 'PAYEE') {
            return res.status(400).json({ 
                success: false, 
                message: 'Une facture payée ne peut pas être annulée.' 
            });
        }

        await db.query(
            'UPDATE factures SET statut = "ANNULEE" WHERE id = ?',
            [id]
        );

        res.json({
            success: true,
            message: 'Facture annulée avec succès.'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de l\'annulation de la facture.' 
        });
    }
};

// Statistiques des factures
const getFactureStats = async (req, res) => {
    try {
        const [stats] = await db.query(`
            SELECT 
                COUNT(*) as total_factures,
                SUM(CASE WHEN statut = 'PAYEE' THEN 1 ELSE 0 END) as factures_payees,
                SUM(CASE WHEN statut = 'PARTIELLEMENT_PAYEE' THEN 1 ELSE 0 END) as factures_partiellement_payees,
                SUM(CASE WHEN statut = 'NON_PAYEE' THEN 1 ELSE 0 END) as factures_non_payees,
                SUM(montant_total) as montant_total,
                SUM(CASE WHEN statut = 'PAYEE' THEN montant_total ELSE 0 END) as montant_percu,
                SUM(CASE WHEN statut != 'PAYEE' THEN montant_total ELSE 0 END) as montant_impaye
            FROM factures
            WHERE statut != 'ANNULEE'
        `);
        
        const [paiementsMois] = await db.query(`
            SELECT 
                DATE_FORMAT(date_paiement, '%Y-%m') as mois,
                SUM(montant) as total
            FROM paiements
            WHERE date_paiement >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
            GROUP BY DATE_FORMAT(date_paiement, '%Y-%m')
            ORDER BY mois DESC
        `);

        res.json({
            success: true,
            data: {
                statistiques: stats[0],
                paiements_par_mois: paiementsMois
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la récupération des statistiques.' 
        });
    }
};

// Rechercher une facture par numéro ou par patient
const searchFacture = async (req, res) => {
    const { q } = req.query;
    
    try {
        let query = `
            SELECT f.*, 
                   p.nom as patient_nom, p.prenom as patient_prenom, p.telephone,
                   COALESCE(SUM(pmt.montant), 0) as montant_paye
            FROM factures f
            JOIN patients p ON f.patient_id = p.id
            LEFT JOIN paiements pmt ON f.id = pmt.facture_id
            WHERE f.id LIKE ? OR p.nom LIKE ? OR p.prenom LIKE ? OR p.telephone LIKE ?
            GROUP BY f.id
            ORDER BY f.date_facture DESC
            LIMIT 10
        `;
        const searchParam = `%${q}%`;
        const [factures] = await db.query(query, [searchParam, searchParam, searchParam, searchParam]);
        
        res.json({ success: true, data: factures });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Erreur lors de la recherche' });
    }
};

module.exports = { getAllFactures, getFactureById, createFacture, addPaiement, annulerFacture, getFactureStats, searchFacture };
