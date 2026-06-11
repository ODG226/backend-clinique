const db = require('../config/database');

// Obtenir tous les médicaments/produits
const getAllProduits = async (req, res) => {
    const { search, type, stock_min } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    try {
        let query = `
            SELECT p.*, s.quantite, s.stock_min, s.date_peremption,
                   c.nom as categorie_nom
            FROM produits p
            LEFT JOIN stock s ON p.id = s.produit_id
            LEFT JOIN categories_produits c ON p.categorie_id = c.id
            WHERE 1=1
        `;
        let countQuery = 'SELECT COUNT(*) as total FROM produits WHERE 1=1';
        const params = [];

        if (search) {
            query += ' AND p.nom LIKE ?';
            countQuery += ' AND nom LIKE ?';
            params.push(`%${search}%`);
        }

        if (type) {
            query += ' AND p.type_produit = ?';
            countQuery += ' AND type_produit = ?';
            params.push(type);
        }

        if (stock_min === 'true') {
            query += ' AND s.quantite <= s.stock_min';
        }

        query += ' ORDER BY p.nom ASC LIMIT ? OFFSET ?';
        
        const [produits] = await db.query(query, [...params, limit, offset]);
        const [countResult] = await db.query(countQuery, params.slice(0, params.length - 2));
        
        // Ajouter le statut de stock pour chaque produit
        const produitsAvecStatut = produits.map(p => ({
            ...p,
            statut_stock: p.quantite <= p.stock_min ? 'CRITIQUE' : 
                         p.quantite <= p.stock_min * 2 ? 'BAS' : 'NORMAL'
        }));

        res.json({
            success: true,
            data: produitsAvecStatut,
            pagination: {
                page,
                limit,
                total: countResult[0].total,
                totalPages: Math.ceil(countResult[0].total / limit)
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la récupération des produits.' 
        });
    }
};

// Obtenir un produit par ID
const getProduitById = async (req, res) => {
    const { id } = req.params;

    try {
        const [produits] = await db.query(
            `SELECT p.*, s.quantite, s.stock_min, s.date_peremption,
                    c.nom as categorie_nom
             FROM produits p
             LEFT JOIN stock s ON p.id = s.produit_id
             LEFT JOIN categories_produits c ON p.categorie_id = c.id
             WHERE p.id = ?`,
            [id]
        );

        if (produits.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Produit non trouvé.' 
            });
        }

        // Récupérer l'historique des mouvements
        const [mouvements] = await db.query(
            `SELECT ms.*, u.nom as utilisateur_nom
             FROM mouvements_stock ms
             LEFT JOIN utilisateurs u ON ms.utilisateur_id = u.id
             WHERE ms.produit_id = ?
             ORDER BY ms.date_mouvement DESC
             LIMIT 20`,
            [id]
        );

        const produit = produits[0];
        produit.historique_mouvements = mouvements;

        res.json({
            success: true,
            data: produit
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la récupération du produit.' 
        });
    }
};

// Créer un nouveau produit
const createProduit = async (req, res) => {
    const {
        nom, type_produit, prix_achat, prix_vente,
        categorie_id, stock_initial, stock_min, date_peremption
    } = req.body;

    if (!nom || !prix_vente) {
        return res.status(400).json({ 
            success: false, 
            message: 'Le nom et le prix de vente sont requis.' 
        });
    }

    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();

        // Insérer le produit
        const [result] = await connection.query(
            `INSERT INTO produits (nom, type_produit, prix_achat, prix_vente, categorie_id)
             VALUES (?, ?, ?, ?, ?)`,
            [nom, type_produit, prix_achat, prix_vente, categorie_id]
        );

        // Insérer le stock initial
        await connection.query(
            `INSERT INTO stock (produit_id, quantite, stock_min, date_peremption)
             VALUES (?, ?, ?, ?)`,
            [result.insertId, stock_initial || 0, stock_min || 10, date_peremption]
        );

        // Enregistrer le mouvement initial
        if (stock_initial && stock_initial > 0) {
            await connection.query(
                `INSERT INTO mouvements_stock (produit_id, type_mouvement, quantite, utilisateur_id, date_mouvement)
                 VALUES (?, 'ENTREE', ?, ?, NOW())`,
                [result.insertId, stock_initial, req.user.id]
            );
        }

        await connection.commit();

        const [newProduit] = await db.query(
            `SELECT p.*, s.quantite, s.stock_min, s.date_peremption
             FROM produits p
             LEFT JOIN stock s ON p.id = s.produit_id
             WHERE p.id = ?`,
            [result.insertId]
        );

        res.status(201).json({
            success: true,
            data: newProduit[0]
        });
    } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la création du produit.' 
        });
    } finally {
        connection.release();
    }
};

// Mettre à jour un produit
const updateProduit = async (req, res) => {
    const { id } = req.params;
    const { nom, type_produit, prix_achat, prix_vente, categorie_id } = req.body;

    try {
        const [existing] = await db.query(
            'SELECT id FROM produits WHERE id = ?',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Produit non trouvé.' 
            });
        }

        await db.query(
            `UPDATE produits 
             SET nom = ?, type_produit = ?, prix_achat = ?, prix_vente = ?, categorie_id = ?
             WHERE id = ?`,
            [nom, type_produit, prix_achat, prix_vente, categorie_id, id]
        );

        const [updatedProduit] = await db.query(
            `SELECT p.*, s.quantite, s.stock_min, s.date_peremption
             FROM produits p
             LEFT JOIN stock s ON p.id = s.produit_id
             WHERE p.id = ?`,
            [id]
        );

        res.json({
            success: true,
            data: updatedProduit[0]
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la mise à jour du produit.' 
        });
    }
};

// Ajuster le stock (entrée/sortie)
const ajusterStock = async (req, res) => {
    const { id } = req.params;
    const { type_mouvement, quantite, motif } = req.body;

    if (!type_mouvement || !quantite || quantite <= 0) {
        return res.status(400).json({ 
            success: false, 
            message: 'Type de mouvement et quantité valide requis.' 
        });
    }

    if (!['ENTREE', 'SORTIE', 'AJUSTEMENT'].includes(type_mouvement)) {
        return res.status(400).json({ 
            success: false, 
            message: 'Type de mouvement invalide.' 
        });
    }

    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();

        // Vérifier le stock actuel
        const [stockActuel] = await connection.query(
            'SELECT quantite FROM stock WHERE produit_id = ?',
            [id]
        );

        if (stockActuel.length === 0) {
            await connection.rollback();
            return res.status(404).json({ 
                success: false, 
                message: 'Stock non trouvé pour ce produit.' 
            });
        }

        const quantiteActuelle = stockActuel[0].quantite;
        let nouvelleQuantite = quantiteActuelle;

        if (type_mouvement === 'ENTREE') {
            nouvelleQuantite = quantiteActuelle + quantite;
        } else if (type_mouvement === 'SORTIE') {
            if (quantiteActuelle < quantite) {
                await connection.rollback();
                return res.status(400).json({ 
                    success: false, 
                    message: 'Stock insuffisant pour cette sortie.' 
                });
            }
            nouvelleQuantite = quantiteActuelle - quantite;
        } else if (type_mouvement === 'AJUSTEMENT') {
            nouvelleQuantite = quantite;
        }

        // Mettre à jour le stock
        await connection.query(
            'UPDATE stock SET quantite = ? WHERE produit_id = ?',
            [nouvelleQuantite, id]
        );

        // Enregistrer le mouvement
        await connection.query(
            `INSERT INTO mouvements_stock (produit_id, type_mouvement, quantite, utilisateur_id, date_mouvement)
             VALUES (?, ?, ?, ?, NOW())`,
            [id, type_mouvement, type_mouvement === 'AJUSTEMENT' ? Math.abs(quantite) : quantite, req.user.id]
        );

        await connection.commit();

        // Vérifier si le stock est critique
        const [stockInfo] = await db.query(
            'SELECT quantite, stock_min FROM stock WHERE produit_id = ?',
            [id]
        );
        
        const estCritique = stockInfo[0].quantite <= stockInfo[0].stock_min;

        res.json({
            success: true,
            message: `Stock ${type_mouvement === 'ENTREE' ? 'augmenté' : type_mouvement === 'SORTIE' ? 'diminué' : 'ajusté'} avec succès.`,
            data: {
                ancienne_quantite: quantiteActuelle,
                nouvelle_quantite: nouvelleQuantite,
                stock_critique: estCritique
            }
        });
    } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de l\'ajustement du stock.' 
        });
    } finally {
        connection.release();
    }
};

// Supprimer un produit
const deleteProduit = async (req, res) => {
    const { id } = req.params;

    try {
        const [result] = await db.query(
            'DELETE FROM produits WHERE id = ?',
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Produit non trouvé.' 
            });
        }

        res.json({
            success: true,
            message: 'Produit supprimé avec succès.'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la suppression du produit.' 
        });
    }
};

// Obtenir les produits en stock critique
const getStockCritique = async (req, res) => {
    try {
        const [produits] = await db.query(
            `SELECT p.*, s.quantite, s.stock_min, s.date_peremption
             FROM produits p
             JOIN stock s ON p.id = s.produit_id
             WHERE s.quantite <= s.stock_min
             ORDER BY (s.quantite / s.stock_min) ASC`
        );

        res.json({
            success: true,
            data: produits,
            count: produits.length
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la récupération des stocks critiques.' 
        });
    }
};

module.exports = {
    getAllProduits,
    getProduitById,
    createProduit,
    updateProduit,
    ajusterStock,
    deleteProduit,
    getStockCritique
};