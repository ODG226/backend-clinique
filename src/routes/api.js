const express = require('express');
const router = express.Router();
const db = require('../config/database'); // Ajoutez cette ligne pour db
const bcrypt = require('bcryptjs'); // Ajoutez cette ligne pour bcrypt

// Middleware
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// Controllers
const authController = require('../controllers/authController');
const patientController = require('../controllers/patientController');
const rdvController = require('../controllers/rdvController');
const consultationController = require('../controllers/consultationController');
const medicamentController = require('../controllers/medicamentController');
const factureController = require('../controllers/factureController');
const chambreController = require('../controllers/chambreController');

// ==============================================
// ROUTES PUBLIQUES (sans authentification)
// ==============================================
router.post('/auth/login', authController.login);
router.post('/auth/register', authController.register);

// ==============================================
// ROUTES PROTÉGÉES (avec authentification)
// ==============================================
router.use(authenticateToken); // Ce middleware s'applique à TOUTES les routes ci-dessous

// Profil utilisateur
router.get('/auth/profile', authController.getProfile);
router.put('/auth/profile', async (req, res) => {
  const { nom, email } = req.body;
  const userId = req.user.id;

  try {
    await db.query(
      'UPDATE utilisateurs SET nom = ?, email = ? WHERE id = ?',
      [nom, email, userId]
    );
    res.json({ success: true, message: 'Profil mis à jour' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Erreur lors de la mise à jour' });
  }
});

router.post('/auth/change-password', async (req, res) => {
  const { current_password, new_password } = req.body;
  const userId = req.user.id;

  try {
    const [users] = await db.query(
      'SELECT mot_de_passe FROM utilisateurs WHERE id = ?',
      [userId]
    );
    
    const isValid = await bcrypt.compare(current_password, users[0].mot_de_passe);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Mot de passe actuel incorrect' });
    }
    
    const hashedPassword = await bcrypt.hash(new_password, 10);
    await db.query(
      'UPDATE utilisateurs SET mot_de_passe = ? WHERE id = ?',
      [hashedPassword, userId]
    );
    
    res.json({ success: true, message: 'Mot de passe changé avec succès' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Erreur lors du changement' });
  }
});

// Routes Patients
router.get('/patients', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'MEDECIN', 'RECEPTIONNISTE'), patientController.getAllPatients);
router.get('/patients/:id', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'MEDECIN', 'RECEPTIONNISTE'), patientController.getPatientById);
router.post('/patients', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONNISTE'), patientController.createPatient);
router.put('/patients/:id', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'MEDECIN'), patientController.updatePatient);
router.delete('/patients/:id', authorizeRoles('SUPER_ADMIN', 'ADMIN'), patientController.deletePatient);

// Routes Rendez-vous
router.get('/rendez-vous', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'MEDECIN', 'RECEPTIONNISTE'), rdvController.getAllRendezVous);
router.get('/rendez-vous/:id', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'MEDECIN', 'RECEPTIONNISTE'), rdvController.getRendezVousById);
router.post('/rendez-vous', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONNISTE'), rdvController.createRendezVous);
router.patch('/rendez-vous/:id/statut', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'MEDECIN', 'RECEPTIONNISTE'), rdvController.updateRendezVousStatus);
router.delete('/rendez-vous/:id', authorizeRoles('SUPER_ADMIN', 'ADMIN'), rdvController.deleteRendezVous);

// Routes Consultations
router.get('/consultations', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'MEDECIN'), consultationController.getAllConsultations);
router.get('/consultations/:id', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'MEDECIN'), consultationController.getConsultationById);
router.post('/consultations', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'MEDECIN'), consultationController.createConsultation);
router.put('/consultations/:id', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'MEDECIN'), consultationController.updateConsultation);

// Routes Produits/Médicaments
router.get('/produits', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'MEDECIN', 'CAISSIER'), medicamentController.getAllProduits);
router.get('/produits/stock-critique', authorizeRoles('SUPER_ADMIN', 'ADMIN'), medicamentController.getStockCritique);
router.get('/produits/:id', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'MEDECIN'), medicamentController.getProduitById);
router.post('/produits', authorizeRoles('SUPER_ADMIN', 'ADMIN'), medicamentController.createProduit);
router.put('/produits/:id', authorizeRoles('SUPER_ADMIN', 'ADMIN'), medicamentController.updateProduit);
router.patch('/produits/:id/stock', authorizeRoles('SUPER_ADMIN', 'ADMIN'), medicamentController.ajusterStock);
router.delete('/produits/:id', authorizeRoles('SUPER_ADMIN', 'ADMIN'), medicamentController.deleteProduit);

// Routes Factures
router.get('/factures', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'CAISSIER'), factureController.getAllFactures);
router.get('/factures/stats', authorizeRoles('SUPER_ADMIN', 'ADMIN'), factureController.getFactureStats);
router.get('/factures/:id', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'CAISSIER'), factureController.getFactureById);
router.post('/factures', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'CAISSIER'), factureController.createFacture);
router.post('/factures/:id/paiements', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'CAISSIER'), factureController.addPaiement);
router.patch('/factures/:id/annuler', authorizeRoles('SUPER_ADMIN', 'ADMIN'), factureController.annulerFacture);

// Routes Chambres
router.get('/chambres', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONNISTE'), chambreController.getAllChambres);
router.get('/chambres/stats', authorizeRoles('SUPER_ADMIN', 'ADMIN'), chambreController.getOccupationStats);
router.get('/chambres/:id', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONNISTE'), chambreController.getChambreById);
router.post('/chambres', authorizeRoles('SUPER_ADMIN', 'ADMIN'), chambreController.createChambre);
router.put('/chambres/:id', authorizeRoles('SUPER_ADMIN', 'ADMIN'), chambreController.updateChambre);
router.delete('/chambres/:id', authorizeRoles('SUPER_ADMIN', 'ADMIN'), chambreController.deleteChambre);

// Routes Admin - Gestion des utilisateurs
const userController = require('../controllers/userController');

router.get('/admin/users', authorizeRoles('SUPER_ADMIN', 'ADMIN'), userController.getAllUsers);
router.get('/admin/users/:id', authorizeRoles('SUPER_ADMIN', 'ADMIN'), userController.getUserById);
router.post('/admin/users', authorizeRoles('SUPER_ADMIN', 'ADMIN'), userController.createUser);
router.put('/admin/users/:id', authorizeRoles('SUPER_ADMIN', 'ADMIN'), userController.updateUser);
router.delete('/admin/users/:id', authorizeRoles('SUPER_ADMIN', 'ADMIN'), userController.deleteUser);
router.patch('/admin/users/:id/status', authorizeRoles('SUPER_ADMIN', 'ADMIN'), userController.changeUserStatus);

// Routes Patients - Ajouter RECEPTIONNISTE et CAISSIER
router.get('/patients', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'MEDECIN', 'RECEPTIONNISTE', 'CAISSIER'), patientController.getAllPatients);
router.get('/patients/:id', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'MEDECIN', 'RECEPTIONNISTE', 'CAISSIER'), patientController.getPatientById);
router.post('/patients', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONNISTE', 'CAISSIER'), patientController.createPatient);
router.put('/patients/:id', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'MEDECIN', 'CAISSIER'), patientController.updatePatient);

// Routes Factures - Caissier a tous les droits
router.get('/factures', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'CAISSIER'), factureController.getAllFactures);
router.get('/factures/stats', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'CAISSIER'), factureController.getFactureStats);
router.get('/factures/:id', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'CAISSIER'), factureController.getFactureById);
router.post('/factures', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'CAISSIER'), factureController.createFacture);
router.post('/factures/:id/paiements', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'CAISSIER'), factureController.addPaiement);
router.patch('/factures/:id/annuler', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'CAISSIER'), factureController.annulerFacture);

router.get('/factures/search', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'CAISSIER'), factureController.searchFacture);

module.exports = router;