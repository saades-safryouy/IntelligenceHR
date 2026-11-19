import type { Language } from '../../contexts/I18nContext'

export const managerTranslations: Record<Language, {
  portal: string
  dashboard: string
  team: string
  approvals: string
  overview: string
  welcome: string
  overviewSubtitle: string
  directReports: string
  teamSize: string
  pendingApprovals: string
  pendingLeave: string
  upcomingAbsences: string
  recentActivity: string
  teamMembers: string
  searchableTeam: string
  searchTeam: string
  allStatuses: string
  active: string
  onLeave: string
  suspended: string
  terminated: string
  reportsTo: string
  viewProfile: string
  approvalInbox: string
  filters: string
  module: string
  status: string
  from: string
  to: string
  requester: string
  request: string
  submitted: string
  currentStep: string
  delegated: string
  pending: string
  approved: string
  rejected: string
  returned: string
  cancelled: string
  loading: string
  retry: string
  noTeam: string
  noTeamAccess: string
  noApprovals: string
  noAbsences: string
  noActivity: string
  apiRequired: string
  loadError: string
  searchEmpty: string
  allModules: string
  leave: string
  onboarding: string
  offboarding: string
  today: string
  viewAll: string
  teamUnavailable: string
  leaveType: string
  dateRange: string
  identity: string
  roleDescription: string
  teamActivityDescription: string
  approvalDescription: string
  originalRequest: string
  help: string
  holidays: string
  workflows: string
  notifications: string
  leaveManagement: string
  leaveManagementSubtitle: string
  holidaysManagement: string
  holidaysManagementSubtitle: string
  onboardingManagement: string
  onboardingManagementSubtitle: string
  offboardingManagement: string
  offboardingManagementSubtitle: string
  workflowsManagement: string
  workflowsManagementSubtitle: string
  notificationsManagement: string
  notificationsManagementSubtitle: string
  all: string
  duration: string
  days: string
  backup: string
  note: string
  actions: string
  reviewAndDecide: string
  teamAbsences: string
  readOnlyNotice: string
  year: string
  publicHoliday: string
  recurring: string
  onTrack: string
  atRisk: string
  completed: string
  overdue: string
  stage: string
  progress: string
  tasks: string
  replacement: string
  exitDate: string
  reason: string
  scope: string
  assignedToMe: string
  initiatedByMe: string
  teamWorkflows: string
  decideNow: string
  viewDetails: string
  markRead: string
  markAllRead: string
  unreadOnly: string
  noNotifications: string
  noHolidays: string
  noLeaveRequests: string
  noOnboarding: string
  noOffboarding: string
  noWorkflows: string
  logout: string
}> = {
  en: {
    portal: 'MANAGER PORTAL',
    dashboard: 'Dashboard',
    team: 'My team',
    approvals: 'Approval center',
    overview: 'TEAM OPERATIONS',
    welcome: 'Lead with clarity.',
    overviewSubtitle: 'A live view of your reporting line and decisions waiting in your queue.',
    directReports: 'Direct reports',
    teamSize: 'Team size',
    pendingApprovals: 'Pending approvals',
    pendingLeave: 'Pending leave',
    upcomingAbsences: 'Upcoming absences',
    recentActivity: 'Recent workflow activity',
    teamMembers: 'Team members',
    searchableTeam: 'Visible reporting line',
    searchTeam: 'Search name, title, department…',
    allStatuses: 'All statuses',
    active: 'Active',
    onLeave: 'On leave',
    suspended: 'Suspended',
    terminated: 'Terminated',
    reportsTo: 'Reports to',
    viewProfile: 'View profile',
    approvalInbox: 'Approval inbox',
    filters: 'Refine queue',
    module: 'Module',
    status: 'Status',
    from: 'From',
    to: 'To',
    requester: 'Requester',
    request: 'Request',
    submitted: 'Submitted',
    currentStep: 'Current step',
    delegated: 'Delegated to you',
    pending: 'Pending approval',
    approved: 'Approved',
    rejected: 'Rejected',
    returned: 'Returned for correction',
    cancelled: 'Cancelled',
    loading: 'Loading manager workspace…',
    retry: 'Try again',
    noTeam: 'No visible direct reports or subordinate employees.',
    noTeamAccess: 'Your current access does not include team employee records.',
    noApprovals: 'No approval assignments match these filters.',
    noAbsences: 'No approved absences are scheduled in the next 30 days.',
    noActivity: 'No recent workflow updates are available.',
    apiRequired: 'Manager workspace requires the connected API. No sample data is shown here.',
    loadError: 'The manager workspace could not be loaded.',
    searchEmpty: 'No team members match this search.',
    allModules: 'All modules',
    leave: 'Leave',
    onboarding: 'Onboarding',
    offboarding: 'Offboarding',
    today: 'Today',
    viewAll: 'View all',
    teamUnavailable: 'Team reporting is unavailable because no employee record is linked to your account.',
    leaveType: 'Leave type',
    dateRange: 'Dates',
    identity: 'TEAM / PEOPLE',
    roleDescription: 'Scope follows your assigned employee visibility.',
    teamActivityDescription: 'Workflow activity you are authorized to see.',
    approvalDescription: 'Every decision is recorded by the workflow engine.',
    originalRequest: 'Original request',
    help: 'Help & support',
    logout: 'Logout',
    holidays: 'Holidays',
    workflows: 'Team workflows',
    notifications: 'Notifications',
    leaveManagement: 'Team leave management',
    leaveManagementSubtitle: 'Review leave requests and track scheduled team absences across your reporting hierarchy.',
    holidaysManagement: 'Company holiday calendar',
    holidaysManagementSubtitle: 'Official organization and site holidays factored into leave calculations.',
    onboardingManagement: 'Team onboarding',
    onboardingManagementSubtitle: 'Track provisioning, milestones, and approvals for new hires joining your department.',
    offboardingManagement: 'Team offboarding',
    offboardingManagementSubtitle: 'Oversee handover, clearance progress, and exit approvals for departing personnel.',
    workflowsManagement: 'Team workflows & tasks',
    workflowsManagementSubtitle: 'Central visibility on all active business processes, pending steps, and decisions across your team.',
    notificationsManagement: 'Notification center',
    notificationsManagementSubtitle: 'Real-time alerts on workflow assignments, status changes, and team operational updates.',
    all: 'All',
    duration: 'Duration',
    days: 'days',
    backup: 'Backup',
    note: 'Note',
    actions: 'Actions',
    reviewAndDecide: 'Review & decide',
    teamAbsences: 'Team absences schedule',
    readOnlyNotice: 'Read-only operational view. Decisions and updates are executed through formal approval workflows.',
    year: 'Year',
    publicHoliday: 'Public holiday',
    recurring: 'Recurring',
    onTrack: 'On track',
    atRisk: 'At risk',
    completed: 'Completed',
    overdue: 'Overdue',
    stage: 'Stage',
    progress: 'Progress',
    tasks: 'Tasks',
    replacement: 'Replacement',
    exitDate: 'Exit date',
    reason: 'Reason',
    scope: 'Scope',
    assignedToMe: 'Assigned to me',
    initiatedByMe: 'Initiated by me',
    teamWorkflows: 'All team workflows',
    decideNow: 'Decide now',
    viewDetails: 'View details',
    markRead: 'Mark as read',
    markAllRead: 'Mark all as read',
    unreadOnly: 'Unread only',
    noNotifications: 'You are all caught up. No notifications found.',
    noHolidays: 'No official holidays found for the selected period.',
    noLeaveRequests: 'No team leave requests found.',
    noOnboarding: 'No active onboarding cases found for your team.',
    noOffboarding: 'No offboarding cases found for your team.',
    noWorkflows: 'No team workflows match your current filters.',
  },
  fr: {
    portal: 'ESPACE RESPONSABLE',
    dashboard: 'Tableau de bord',
    team: 'Mon équipe',
    approvals: 'Centre d’approbation',
    overview: 'OPÉRATIONS D’ÉQUIPE',
    welcome: 'Dirigez avec clarté.',
    overviewSubtitle: 'Vue actualisée de votre équipe et des décisions en attente.',
    directReports: 'Rapports directs',
    teamSize: 'Taille de l’équipe',
    pendingApprovals: 'Approbations en attente',
    pendingLeave: 'Congés en attente',
    upcomingAbsences: 'Absences à venir',
    recentActivity: 'Activité récente des workflows',
    teamMembers: 'Membres de l’équipe',
    searchableTeam: 'Ligne hiérarchique visible',
    searchTeam: 'Rechercher nom, poste, département…',
    allStatuses: 'Tous les statuts',
    active: 'Actif',
    onLeave: 'En congé',
    suspended: 'Suspendu',
    terminated: 'Terminé',
    reportsTo: 'Responsable hiérarchique',
    viewProfile: 'Voir le profil',
    approvalInbox: 'Boîte d’approbation',
    filters: 'Filtrer la file',
    module: 'Module',
    status: 'Statut',
    from: 'Du',
    to: 'Au',
    requester: 'Demandeur',
    request: 'Demande',
    submitted: 'Soumise',
    currentStep: 'Étape actuelle',
    delegated: 'Délégué à vous',
    pending: 'Approbation en attente',
    approved: 'Approuvé',
    rejected: 'Refusé',
    returned: 'Renvoyé pour correction',
    cancelled: 'Annulé',
    loading: 'Chargement de l’espace responsable…',
    retry: 'Réessayer',
    noTeam: 'Aucun subordonné visible dans votre périmètre.',
    noTeamAccess: 'Votre accès actuel ne comprend pas les dossiers des employés de l’équipe.',
    noApprovals: 'Aucune approbation ne correspond à ces filtres.',
    noAbsences: 'Aucune absence approuvée prévue dans les 30 prochains jours.',
    noActivity: 'Aucune mise à jour récente des workflows disponible.',
    apiRequired: 'L’espace responsable nécessite l’API connectée. Aucune donnée fictive n’est affichée.',
    loadError: 'Impossible de charger l’espace responsable.',
    searchEmpty: 'Aucun membre ne correspond à cette recherche.',
    allModules: 'Tous les modules',
    leave: 'Congés',
    onboarding: 'Intégration',
    offboarding: 'Départ',
    today: 'Aujourd’hui',
    viewAll: 'Tout afficher',
    teamUnavailable: 'Le suivi d’équipe est indisponible : aucun dossier employé n’est lié à votre compte.',
    leaveType: 'Type de congé',
    dateRange: 'Dates',
    identity: 'ÉQUIPE / PERSONNES',
    roleDescription: 'Le périmètre suit vos autorisations de visibilité des employés.',
    teamActivityDescription: 'Activité de workflow visible selon vos autorisations.',
    approvalDescription: 'Chaque décision est enregistrée par le moteur de workflow.',
    originalRequest: 'Demande d’origine',
    help: 'Aide et assistance',
    logout: 'Déconnexion',
    holidays: 'Jours fériés',
    workflows: 'Processus d’équipe',
    notifications: 'Notifications',
    leaveManagement: 'Gestion des congés d’équipe',
    leaveManagementSubtitle: 'Consultez les demandes de congés et le calendrier des absences au sein de votre périmètre.',
    holidaysManagement: 'Calendrier des jours fériés',
    holidaysManagementSubtitle: 'Jours fériés officiels et de site pris en compte dans le calcul des congés.',
    onboardingManagement: 'Intégration de l’équipe',
    onboardingManagementSubtitle: 'Suivez le déploiement des accès, étapes et approbations des nouveaux collaborateurs.',
    offboardingManagement: 'Départ des collaborateurs',
    offboardingManagementSubtitle: 'Supervisez la passation, le solde des tâches et les approbations de sortie.',
    workflowsManagement: 'Processus et tâches d’équipe',
    workflowsManagementSubtitle: 'Visibilité unifiée sur l’ensemble des processus opérationnels et validations de votre équipe.',
    notificationsManagement: 'Centre de notifications',
    notificationsManagementSubtitle: 'Alertes en temps réel sur les assignations de workflow et l’activité de votre équipe.',
    all: 'Tous',
    duration: 'Durée',
    days: 'jours',
    backup: 'Remplaçant',
    note: 'Note',
    actions: 'Actions',
    reviewAndDecide: 'Examiner & décider',
    teamAbsences: 'Planning des absences de l’équipe',
    readOnlyNotice: 'Vue opérationnelle informative. Les décisions s’effectuent via les processus d’approbation officiels.',
    year: 'Année',
    publicHoliday: 'Jour férié officiel',
    recurring: 'Récurrent',
    onTrack: 'En bonne voie',
    atRisk: 'À risque',
    completed: 'Terminé',
    overdue: 'En retard',
    stage: 'Étape',
    progress: 'Progression',
    tasks: 'Tâches',
    replacement: 'Remplacement',
    exitDate: 'Date de sortie',
    reason: 'Motif',
    scope: 'Périmètre',
    assignedToMe: 'Assigné à moi',
    initiatedByMe: 'Initié par moi',
    teamWorkflows: 'Tous les processus d’équipe',
    decideNow: 'Décider maintenant',
    viewDetails: 'Voir les détails',
    markRead: 'Marquer comme lu',
    markAllRead: 'Tout marquer comme lu',
    unreadOnly: 'Non lus uniquement',
    noNotifications: 'Vous êtes à jour. Aucune notification trouvée.',
    noHolidays: 'Aucun jour férié trouvé pour cette période.',
    noLeaveRequests: 'Aucune demande de congé trouvée.',
    noOnboarding: 'Aucun dossier d’intégration en cours pour votre équipe.',
    noOffboarding: 'Aucun dossier de départ en cours pour votre équipe.',
    noWorkflows: 'Aucun processus d’équipe ne correspond aux filtres.',
  },
  ar: {
    portal: 'بوابة المدير',
    dashboard: 'لوحة التحكم',
    team: 'فريقي',
    approvals: 'مركز الموافقات',
    overview: 'عمليات الفريق',
    welcome: 'قد بوضوح.',
    overviewSubtitle: 'عرض مباشر لفريقك والقرارات التي تنتظر مراجعتك.',
    directReports: 'التقارير المباشرة',
    teamSize: 'حجم الفريق',
    pendingApprovals: 'الموافقات المعلّقة',
    pendingLeave: 'طلبات الإجازة المعلّقة',
    upcomingAbsences: 'الغيابات القادمة',
    recentActivity: 'أحدث أنشطة سير العمل',
    teamMembers: 'أعضاء الفريق',
    searchableTeam: 'النطاق الإداري المرئي',
    searchTeam: 'ابحث بالاسم أو المسمى أو القسم…',
    allStatuses: 'كل الحالات',
    active: 'نشط',
    onLeave: 'في إجازة',
    suspended: 'موقوف',
    terminated: 'منتهي الخدمة',
    reportsTo: 'يتبع إدارياً',
    viewProfile: 'عرض الملف',
    approvalInbox: 'صندوق الموافقات',
    filters: 'تصفية الطلبات',
    module: 'الوحدة',
    status: 'الحالة',
    from: 'من',
    to: 'إلى',
    requester: 'مقدم الطلب',
    request: 'الطلب',
    submitted: 'تاريخ التقديم',
    currentStep: 'الخطوة الحالية',
    delegated: 'مفوّض إليك',
    pending: 'بانتظار الموافقة',
    approved: 'موافق عليه',
    rejected: 'مرفوض',
    returned: 'معاد للتصحيح',
    cancelled: 'ملغى',
    loading: 'جارٍ تحميل مساحة المدير…',
    retry: 'إعادة المحاولة',
    noTeam: 'لا يوجد موظفون تابعون ظاهرون ضمن نطاقك.',
    noTeamAccess: 'لا يتضمن وصولك الحالي سجلات موظفي الفريق.',
    noApprovals: 'لا توجد موافقات مطابقة لهذه المرشحات.',
    noAbsences: 'لا توجد إجازات معتمدة خلال الثلاثين يوماً القادمة.',
    noActivity: 'لا توجد تحديثات حديثة متاحة لسير العمل.',
    apiRequired: 'تتطلب مساحة المدير الاتصال بواجهة النظام. لا تُعرض بيانات تجريبية.',
    loadError: 'تعذر تحميل مساحة المدير.',
    searchEmpty: 'لا يوجد أعضاء فريق يطابقون البحث.',
    allModules: 'كل الوحدات',
    leave: 'الإجازات',
    onboarding: 'التهيئة',
    offboarding: 'إنهاء الخدمة',
    today: 'اليوم',
    viewAll: 'عرض الكل',
    teamUnavailable: 'تعذر عرض الفريق لعدم ربط سجل موظف بحسابك.',
    leaveType: 'نوع الإجازة',
    dateRange: 'التواريخ',
    identity: 'الفريق / الموظفون',
    roleDescription: 'يتبع النطاق صلاحيات رؤية الموظفين الممنوحة لك.',
    teamActivityDescription: 'أنشطة سير العمل المسموح لك برؤيتها.',
    approvalDescription: 'يسجل محرك سير العمل جميع القرارات.',
    originalRequest: 'الطلب الأصلي',
    help: 'المساعدة والدعم',
    logout: 'تسجيل الخروج',
    holidays: 'العطلات الرسمية',
    workflows: 'مهام سير العمل',
    notifications: 'الإشعارات',
    leaveManagement: 'إدارة إجازات الفريق',
    leaveManagementSubtitle: 'مراجعة طلبات الإجازات ومتابعة جدول غيابات الفريق المعتمدة ضمن نطاقك.',
    holidaysManagement: 'جدول العطلات الرسمية',
    holidaysManagementSubtitle: 'العطلات الرسمية المعتمدة للمؤسسة المأخوذة بالحسبان عند احتساب الإجازات.',
    onboardingManagement: 'تهيئة وتعيين أعضاء الفريق',
    onboardingManagementSubtitle: 'متابعة مراحل التجهيز والمهام والموافقات للموظفين الجدد في إدارتك.',
    offboardingManagement: 'إنهاء خدمة الموظفين',
    offboardingManagementSubtitle: 'الإشراف على تسليم المهام وإجراءات المخالصة وموافقات الخروج.',
    workflowsManagement: 'عمليات ومهام الفريق',
    workflowsManagementSubtitle: 'رؤية موحدة لجميع مسارات العمل والخطوات المعلقة والقرارات المطلوب اتخاذها.',
    notificationsManagement: 'مركز الإشعارات',
    notificationsManagementSubtitle: 'تنبيهات فورية للمهام المسندة إليك وتحديثات حالة العمليات الإدارية.',
    all: 'الكل',
    duration: 'المدة',
    days: 'أيام',
    backup: 'الموظف البديل',
    note: 'ملاحظة',
    actions: 'الإجراءات',
    reviewAndDecide: 'مراجعة واتخاذ القرار',
    teamAbsences: 'جدول غيابات الفريق',
    readOnlyNotice: 'عرض معلوماتي تشغيلي. القرارات والإجراءات تنفذ عبر مسارات الموافقة الرسمية.',
    year: 'السنة',
    publicHoliday: 'عطلة رسمية',
    recurring: 'متكررة سنويًا',
    onTrack: 'في المسار الصحيح',
    atRisk: 'معرض للتعثر',
    completed: 'مكتمل',
    overdue: 'متأخر',
    stage: 'المرحلة',
    progress: 'نسبة الإنجاز',
    tasks: 'المهام',
    replacement: 'البديل',
    exitDate: 'تاريخ الخروج',
    reason: 'السبب',
    scope: 'النطاق',
    assignedToMe: 'مسند إليّ',
    initiatedByMe: 'مقدم مني',
    teamWorkflows: 'كل عمليات الفريق',
    decideNow: 'اتخاذ القرار الآن',
    viewDetails: 'عرض التفاصيل',
    markRead: 'تحديد كمقروء',
    markAllRead: 'تحديد الكل كمقروء',
    unreadOnly: 'غير المقروء فقط',
    noNotifications: 'لا توجد إشعارات حالياً.',
    noHolidays: 'لا توجد عطلات رسمية مسجلة لهذه الفترة.',
    noLeaveRequests: 'لا توجد طلبات إجازة للفريق.',
    noOnboarding: 'لا توجد ملفات تهيئة نشطة لفريقك.',
    noOffboarding: 'لا توجد ملفات إنهاء خدمة لفريقك.',
    noWorkflows: 'لا توجد مسارات عمل تطابق هذه التصفية.',
  },
}
