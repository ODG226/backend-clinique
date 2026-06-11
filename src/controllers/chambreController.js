const db = require('../config/database');

// Obtenir toutes les chambres
const getAllChambres = async (req, res) => {
    const { statut, type_chambre } = req.query;

    try {
        let query = `
            SELECT c.*, 
                   COUNT(l.id) as total_lits,
                   SUM(CASE WHEN l.statut = 'OCCUPE' THEN 1 ELSE 0 END) as lits_occupes
            FROM chambres c
            LEFT JOIN lits l ON c.id = l.chambre_id
            WHERE 1=1
        `;
        const params = [];

        if (statut) {
            query += ' AND c.statut = ?';
            params.push(statut);
        }

        if (type_chambre) {
            query += ' AND c.type_chambre = ?';
            params.push(type_chambre);
        }

        query += ' GROUP BY c.id ORDER BY c.numero ASC';

        const [chambres] = await db.query(query, params);
        
        // Ajouter le taux d'occupation
        const chambresAvecTaux = chambres.map(c => ({
            ...c,
            taux_occupation: c.total_lits > 0 ? (c.lits_occupes / c.total_lits) * 100 : 0
        }));

        res.json({
            success: true,
            data: chambresAvecTaux
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la récupération des chambres.' 
        });
    }
};

// Obtenir une chambre par ID
const getChambreById = async (req, res) => {
    const { id } = req.params;

    try {
        const [chambres] = await db.query(
            `SELECT c.*, 
                    COUNT(l.id) as total_lits,
                    SUM(CASE WHEN l.statut = 'OCCUPE' THEN 1 ELSE 0 END) as lits_occupes
             FROM chambres c
             LEFT JOIN lits l ON c.id = l.chambre_id
             WHERE c.id = ?
             GROUP BY c.id`,
            [id]
        );

        if (chambres.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Chambre non trouvée.' 
            });
        }

        // Récupérer les lits avec leurs patients
        const [lits] = await db.query(
            `SELECT l.*, 
                    p.nom as patient_nom, p.prenom as patient_prenom
             FROM lits l
             LEFT JOIN hospitalisations h ON l.id = h.lit_id AND h.date_sortie IS NULL
             LEFT JOIN patients p ON h.patient_id = p.id
             WHERE l.chambre_id = ?`,
            [id]
        );

        const chambre = chambres[0];
        chambre.lits = lits;
        chambre.taux_occupation = chambre.total_lits > 0 ? (chambre.lits_occupes / chambre.total_lits) * 100 : 0;

        res.json({
            success: true,
            data: chambre
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la récupération de la chambre.' 
        });
    }
};

// Créer une nouvelle chambre
const createChambre = async (req, res) => {
    const { numero, type_chambre, tarif, nombre_lits } = req.body;

    if (!numero || !type_chambre) {
        return res.status(400).json({ 
            success: false, 
            message: 'Le numéro et le type de chambre sont requis.' 
        });
    }

    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();

        // Vérifier si le numéro existe déjà
        const [existing] = await connection.query(
            'SELECT id FROM chambres WHERE numero = ?',
            [numero]
        );

        if (existing.length > 0) {
            await connection.rollback();
            return res.status(400).json({ 
                success: false, 
                message: 'Une chambre avec ce numéro existe déjà.' 
            });
        }

        // Créer la chambre
        const [result] = await connection.query(
            `INSERT INTO chambres (numero, type_chambre, tarif, statut)
             VALUES (?, ?, ?, 'LIBRE')`,
            [numero, type_chambre, tarif || 0]
        );

        // Créer les lits
        if (nombre_lits && nombre_lits > 0) {
            for (let i = 1; i <= nombre_lits; i++) {
                await connection.query(
                    `INSERT INTO lits (chambre_id, numero_lit, statut)
                     VALUES (?, ?, 'LIBRE')`,
                    [result.insertId, `${numero}-${i}`]
                );
            }
        }

        await connection.commit();

        const [newChambre] = await db.query(
            'SELECT * FROM chambres WHERE id = ?',
            [result.insertId]
        );

        res.status(201).json({
            success: true,
            data: newChambre[0]
        });
    } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la création de la chambre.' 
        });
    } finally {
        connection.release();
    }
};

// Mettre à jour une chambre
const updateChambre = async (req, res) => {
    const { id } = req.params;
    const { type_chambre, tarif, statut } = req.body;

    try {
        const [existing] = await db.query(
            'SELECT id FROM chambres WHERE id = ?',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Chambre non trouvée.' 
            });
        }

        const updates = [];
        const values = [];

        if (type_chambre !== undefined) {
            updates.push('type_chambre = ?');
            values.push(type_chambre);
        }
        if (tarif !== undefined) {
            updates.push('tarif = ?');
            values.push(tarif);
        }
        if (statut !== undefined) {
            updates.push('statut = ?');
            values.push(statut);
        }

        if (updates.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Aucune donnée à mettre à jour.' 
            });
        }

        values.push(id);
        await db.query(
            `UPDATE chambres SET ${updates.join(', ')} WHERE id = ?`,
            values
        );

        const [updatedChambre] = await db.query(
            'SELECT * FROM chambres WHERE id = ?',
            [id]
        );

        res.json({
            success: true,
            data: updatedChambre[0]
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la mise à jour de la chambre.' 
        });
    }
};

// Supprimer une chambre
const deleteChambre = async (req, res) => {
    const { id } = req.params;

    try {
        // Vérifier si des lits sont occupés
        const [litsOccupes] = await db.query(
            `SELECT COUNT(*) as count FROM lits 
             WHERE chambre_id = ? AND statut = 'OCCUPE'`,
            [id]
        );

        if (litsOccupes[0].count > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Impossible de supprimer une chambre avec des lits occupés.' 
            });
        }

        const [result] = await db.query(
            'DELETE FROM chambres WHERE id = ?',
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Chambre non trouvée.' 
            });
        }

        res.json({
            success: true,
            message: 'Chambre supprimée avec succès.'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la suppression de la chambre.' 
        });
    }
};

// Obtenir les statistiques d'occupation
const getOccupationStats = async (req, res) => {
    try {
        const [stats] = await db.query(`
            SELECT 
                COUNT(DISTINCT c.id) as total_chambres,
                SUM(CASE WHEN c.statut = 'OCCUPEE' THEN 1 ELSE 0 END) as chambres_occupees,
                SUM(CASE WHEN c.statut = 'LIBRE' THEN 1 ELSE 0 END) as chambres_libres,
                COUNT(l.id) as total_lits,
                SUM(CASE WHEN l.statut = 'OCCUPE' THEN 1 ELSE 0 END) as lits_occupes,
                ROUND((SUM(CASE WHEN l.statut = 'OCCUPE' THEN 1 ELSE 0 END) / COUNT(l.id)) * 100, 2) as taux_occupation
            FROM chambres c
            LEFT JOIN lits l ON c.id = l.chambre_id
        `);

        const [occupationParType] = await db.query(`
            SELECT 
                c.type_chambre,
                COUNT(DISTINCT c.id) as total_chambres,
                COUNT(l.id) as total_lits,
                SUM(CASE WHEN l.statut = 'OCCUPE' THEN 1 ELSE 0 END) as lits_occupes
            FROM chambres c
            LEFT JOIN lits l ON c.id = l.chambre_id
            GROUP BY c.type_chambre
        `);

        res.json({
            success: true,
            data: {
                global: stats[0],
                par_type: occupationParType
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

module.exports = {
    getAllChambres,
    getChambreById,
    createChambre,
    updateChambre,
    deleteChambre,
    getOccupationStats
};