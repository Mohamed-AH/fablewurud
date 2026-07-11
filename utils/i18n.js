/**
 * Simple i18n (internationalization) system for Duroos platform
 * Supports Arabic (ar) and English (en)
 */

const translations = {
  ar: {
    // Navigation
    nav_home: 'الرئيسية',
    nav_lectures: 'جميع المحاضرات',
    nav_sheikhs: 'الشيوخ',
    nav_series: 'السلاسل',
    nav_search: 'بحث...',

    // Homepage
    home_title: 'منصة الدروس للمحاضرات الإسلامية',
    home_subtitle: 'استمع إلى محاضرات العلماء والمشايخ في العقيدة والفقه والتفسير وغيرها',
    home_browse_btn: 'تصفح المحاضرات',
    home_featured: 'محاضرات مميزة',
    home_recent: 'أحدث المحاضرات',

    // Statistics
    stat_lectures: 'محاضرة',
    stat_sheikhs: 'شيخ',
    stat_series: 'سلسلة',
    stat_plays: 'استماع',
    stat_hours: 'ساعة محتوى',

    // Browse page
    browse_title: 'جميع المحاضرات',
    browse_filter_category: 'تصفية حسب التصنيف',
    browse_all_categories: 'جميع التصنيفات',
    browse_search: 'ابحث في المحاضرات',
    browse_no_results: 'لا توجد نتائج',
    browse_results_count: 'محاضرة',

    // Lecture detail
    lecture_about: 'عن المحاضرة',
    lecture_sheikh_bio: 'نبذة عن الشيخ',
    lecture_related: 'محاضرات ذات صلة',
    lecture_download: 'تحميل المحاضرة',
    lecture_share: 'مشاركة',
    lecture_play: 'تشغيل',
    lecture_pause: 'إيقاف مؤقت',
    lecture_volume: 'الصوت',
    lecture_speed: 'السرعة',
    lecture_location: 'الموقع',

    // Sheikh profile
    sheikh_profile: 'الملف الشخصي',
    sheikh_lectures: 'جميع المحاضرات',
    sheikh_series: 'السلاسل',
    sheikh_bio: 'نبذة عن الشيخ',
    sheikh_more: 'المزيد من محاضرات الشيخ',
    sheikh_no_lectures: 'لا توجد محاضرات منشورة حالياً',

    // Series detail
    series_title: 'السلاسل',
    series_lectures: 'دروس السلسلة',
    series_about: 'وصف السلسلة',
    series_completion: 'مرقمة',
    series_no_lectures: 'لا توجد محاضرات منشورة في هذه السلسلة حالياً',

    // Categories
    category_aqeedah: 'العقيدة',
    category_fiqh: 'الفقه',
    category_tafsir: 'التفسير',
    category_hadith: 'الحديث',
    category_seerah: 'السيرة',
    category_general: 'عام',
    category_other: 'أخرى',

    // Common
    common_listen: 'استماع',
    common_download: 'تحميل',
    common_duration: 'المدة',
    common_date: 'التاريخ',
    common_views: 'مرة',
    common_loading: 'جاري التحميل...',
    common_error: 'حدث خطأ',
    common_not_found: 'غير موجود',

    // Footer
    footer_about: 'عن المنصة',
    footer_about_text: 'منصة الدروس للمحاضرات الإسلامية - نسعى لنشر العلم الشرعي',
    footer_quick_links: 'روابط سريعة',
    footer_categories: 'التصنيفات',
    footer_rights: 'جميع الحقوق محفوظة',

    // Breadcrumbs
    breadcrumb_home: 'الرئيسية',
    breadcrumb_lectures: 'المحاضرات',
    breadcrumb_sheikhs: 'الشيوخ',
    breadcrumb_series: 'السلاسل',

    // Admin - Navigation
    admin_title: 'لوحة التحكم',
    admin_dashboard: 'الرئيسية',
    admin_upload: 'رفع محاضرة',
    admin_bulk_upload: 'رفع متعدد',
    admin_manage: 'الإدارة',
    admin_schedule: 'الجدول',
    admin_analytics: 'الإحصائيات',
    admin_logout: 'تسجيل الخروج',
    admin_users: 'المستخدمين',
    admin_sheikhs: 'الشيوخ',
    admin_lectures: 'المحاضرات',
    admin_series: 'السلاسل',

    // Admin - Dashboard
    admin_total_lectures: 'إجمالي المحاضرات',
    admin_published: 'المنشورة',
    admin_unpublished: 'غير المنشورة',
    admin_total_plays: 'مرات الاستماع',
    admin_total_downloads: 'مرات التحميل',
    admin_total_sheikhs: 'عدد الشيوخ',
    admin_total_series: 'عدد السلاسل',
    admin_recent_lectures: 'أحدث المحاضرات',
    admin_no_lectures: 'لا توجد محاضرات',

    // Admin - Table Headers
    admin_th_title: 'العنوان',
    admin_th_title_ar: 'العنوان (عربي)',
    admin_th_title_en: 'العنوان (إنجليزي)',
    admin_th_sheikh: 'الشيخ',
    admin_th_series: 'السلسلة',
    admin_th_status: 'الحالة',
    admin_th_plays: 'الاستماع',
    admin_th_downloads: 'التحميل',
    admin_th_date: 'التاريخ',
    admin_th_actions: 'الإجراءات',
    admin_th_category: 'التصنيف',
    admin_th_duration: 'المدة',
    admin_th_audio: 'الصوت',
    admin_th_email: 'البريد الإلكتروني',
    admin_th_role: 'الدور',
    admin_th_last_login: 'آخر دخول',
    admin_th_active: 'نشط',

    // Admin - Status Badges
    admin_status_published: 'منشور',
    admin_status_draft: 'مسودة',
    admin_status_visible: 'مرئي',
    admin_status_hidden: 'مخفي',
    admin_status_active: 'نشط',
    admin_status_inactive: 'غير نشط',
    admin_status_verified: 'موثق',
    admin_status_unverified: 'غير موثق',

    // Admin - Buttons
    admin_btn_save: 'حفظ',
    admin_btn_cancel: 'إلغاء',
    admin_btn_delete: 'حذف',
    admin_btn_edit: 'تعديل',
    admin_btn_view: 'عرض',
    admin_btn_add: 'إضافة',
    admin_btn_create: 'إنشاء',
    admin_btn_update: 'تحديث',
    admin_btn_upload: 'رفع',
    admin_btn_search: 'بحث',
    admin_btn_filter: 'تصفية',
    admin_btn_reset: 'إعادة تعيين',
    admin_btn_back: 'رجوع',
    admin_btn_next: 'التالي',
    admin_btn_previous: 'السابق',
    admin_btn_publish: 'نشر',
    admin_btn_unpublish: 'إلغاء النشر',
    admin_btn_toggle: 'تبديل',

    // Admin - Forms
    admin_form_title_ar: 'العنوان بالعربية',
    admin_form_title_en: 'العنوان بالإنجليزية',
    admin_form_description_ar: 'الوصف بالعربية',
    admin_form_description_en: 'الوصف بالإنجليزية',
    admin_form_sheikh: 'اختر الشيخ',
    admin_form_series: 'اختر السلسلة',
    admin_form_category: 'التصنيف',
    admin_form_date_recorded: 'تاريخ التسجيل',
    admin_form_lecture_number: 'رقم المحاضرة',
    admin_form_location: 'الموقع',
    admin_form_notes: 'ملاحظات',
    admin_form_audio_file: 'ملف الصوت',
    admin_form_select: 'اختر...',
    admin_form_none: 'بدون',
    admin_form_required: 'مطلوب',
    admin_form_optional: 'اختياري',

    // Admin - Messages
    admin_msg_saved: 'تم الحفظ بنجاح',
    admin_msg_deleted: 'تم الحذف بنجاح',
    admin_msg_updated: 'تم التحديث بنجاح',
    admin_msg_created: 'تم الإنشاء بنجاح',
    admin_msg_error: 'حدث خطأ',
    admin_msg_confirm_delete: 'هل أنت متأكد من الحذف؟',
    admin_msg_no_results: 'لا توجد نتائج',
    admin_msg_loading: 'جاري التحميل...',
    admin_msg_uploading: 'جاري الرفع...',

    // Admin - Upload Page
    admin_upload_title: 'رفع محاضرة جديدة',
    admin_upload_drag_drop: 'اسحب وأفلت الملف هنا أو انقر للاختيار',
    admin_upload_supported: 'الملفات المدعومة: MP3, M4A, WAV',
    admin_upload_max_size: 'الحد الأقصى للحجم',
    admin_upload_progress: 'جاري الرفع',

    // Admin - Manage Page
    admin_manage_title: 'إدارة المحتوى',
    admin_manage_quick_actions: 'إجراءات سريعة',
    admin_manage_duration_status: 'حالة المدة',
    admin_manage_no_audio: 'بدون صوت',

    // Admin - Schedule
    admin_schedule_title: 'جدول الدروس الأسبوعي',
    admin_schedule_add: 'إضافة درس',
    admin_schedule_day: 'اليوم',
    admin_schedule_time: 'الوقت',
    admin_schedule_location: 'الموقع',
    admin_schedule_type: 'النوع',
    admin_schedule_online: 'عن بُعد',
    admin_schedule_in_person: 'حضوري',

    // Admin - Analytics
    admin_analytics_title: 'الإحصائيات والتحليلات',
    admin_analytics_summary: 'ملخص',
    admin_analytics_top_lectures: 'أكثر المحاضرات استماعاً',
    admin_analytics_top_downloads: 'أكثر المحاضرات تحميلاً',
    admin_analytics_daily_views: 'الزيارات اليومية',
    admin_analytics_settings: 'إعدادات العرض',

    // Admin - Users
    admin_users_title: 'إدارة المستخدمين',
    admin_users_add: 'إضافة مستخدم',
    admin_users_role_admin: 'مدير',
    admin_users_role_editor: 'محرر',

    // Admin - Sheikhs
    admin_sheikhs_title: 'إدارة الشيوخ',
    admin_sheikhs_add: 'إضافة شيخ',
    admin_sheikhs_name_ar: 'الاسم بالعربية',
    admin_sheikhs_name_en: 'الاسم بالإنجليزية',
    admin_sheikhs_honorific: 'اللقب',
    admin_sheikhs_bio: 'نبذة',
    admin_sheikhs_photo: 'الصورة',
    admin_sheikhs_lecture_count: 'عدد المحاضرات',

    // Admin - Series
    admin_series_title: 'إدارة السلاسل',
    admin_series_add: 'إضافة سلسلة',
    admin_series_reorder: 'إعادة ترتيب المحاضرات',
    admin_series_unassociated: 'محاضرات بدون سلسلة',
    admin_series_assign: 'إسناد لسلسلة',
    admin_series_visibility: 'الظهور',
    admin_series_book_author: 'مؤلف الكتاب',

    // Admin - Articles
    admin_articles: 'المقالات',
    admin_total_articles: 'عدد المقالات',
    admin_articles_title: 'إدارة المقالات',
    admin_articles_add: 'إضافة مقال',
    admin_articles_manage: 'إدارة المقالات',
    admin_articles_edit: 'تعديل المقال',
    admin_articles_type: 'النوع',
    admin_articles_type_asdaa: 'أصداء',
    admin_articles_type_telegram: 'تليجرام',
    admin_articles_summary: 'الملخص',
    admin_articles_content: 'المحتوى',
    admin_articles_source_url: 'رابط المصدر',
    admin_articles_published_at: 'تاريخ النشر',
    admin_articles_no_articles: 'لا توجد مقالات',
    admin_articles_bulk_delete: 'حذف المحدد',
    admin_articles_bulk_publish: 'نشر المحدد',
    admin_articles_bulk_unpublish: 'إلغاء نشر المحدد',

    // Admin - Article Editors
    admin_article_editors: 'محررو المقالات',
    admin_article_editors_manage: 'إدارة المحررين',

    // Admin - Days of Week
    admin_day_sunday: 'الأحد',
    admin_day_monday: 'الإثنين',
    admin_day_tuesday: 'الثلاثاء',
    admin_day_wednesday: 'الأربعاء',
    admin_day_thursday: 'الخميس',
    admin_day_friday: 'الجمعة',
    admin_day_saturday: 'السبت',

    // Admin - Login Page
    admin_login_title: 'تسجيل الدخول',
    admin_login_subtitle: 'منصة دروس للمحاضرات الإسلامية',
    admin_login_google: 'تسجيل الدخول بحساب جوجل',
    admin_login_admin_only: 'للمشرفين فقط',
    admin_login_whitelist_info: 'يمكن فقط لعناوين البريد الإلكتروني المصرح لها الوصول إلى لوحة التحكم.',
    admin_login_error_unauthorized: 'بريدك الإلكتروني غير مصرح له بالوصول إلى لوحة التحكم.',
    admin_login_error_inactive: 'تم تعطيل حساب المشرف الخاص بك.',

    // Site Notice Banner
    notice_message: 'تنبيه: تأثر سيرفر الموقع بالأعطال التقنية، والمحتوى المتاح حالياً هو حتى ٢٢ رمضان. العمل جارٍ على استعادة البيانات، وجميع الدروس متوفرة الآن عبر قناتنا في',
    notice_telegram: 'تيليجرام',

    // Admin - Notice Banner
    admin_notice_banner_title: 'إعدادات شريط التنبيه',
  },

  en: {
    // Navigation
    nav_home: 'Home',
    nav_lectures: 'All Lectures',
    nav_sheikhs: 'Sheikhs',
    nav_series: 'Series',
    nav_search: 'Search...',

    // Homepage
    home_title: 'Duroos Islamic Lectures Platform',
    home_subtitle: 'Listen to lectures from scholars and sheikhs on Aqeedah, Fiqh, Tafsir, and more',
    home_browse_btn: 'Browse Lectures',
    home_featured: 'Featured Lectures',
    home_recent: 'Recent Lectures',

    // Statistics
    stat_lectures: 'Lectures',
    stat_sheikhs: 'Sheikhs',
    stat_series: 'Series',
    stat_plays: 'Plays',
    stat_hours: 'Hours of Content',

    // Browse page
    browse_title: 'All Lectures',
    browse_filter_category: 'Filter by Category',
    browse_all_categories: 'All Categories',
    browse_search: 'Search lectures',
    browse_no_results: 'No results found',
    browse_results_count: 'Lectures',

    // Lecture detail
    lecture_about: 'About this Lecture',
    lecture_sheikh_bio: 'About the Sheikh',
    lecture_related: 'Related Lectures',
    lecture_download: 'Download Lecture',
    lecture_share: 'Share',
    lecture_play: 'Play',
    lecture_pause: 'Pause',
    lecture_volume: 'Volume',
    lecture_speed: 'Speed',
    lecture_location: 'Location',

    // Sheikh profile
    sheikh_profile: 'Profile',
    sheikh_lectures: 'All Lectures',
    sheikh_series: 'Series',
    sheikh_bio: 'About the Sheikh',
    sheikh_more: 'More lectures by this sheikh',
    sheikh_no_lectures: 'No published lectures at this time',

    // Series detail
    series_title: 'Series',
    series_lectures: 'Series Lectures',
    series_about: 'Series Description',
    series_completion: 'Numbered',
    series_no_lectures: 'No published lectures in this series at this time',

    // Categories
    category_aqeedah: 'Aqeedah',
    category_fiqh: 'Fiqh',
    category_tafsir: 'Tafsir',
    category_hadith: 'Hadith',
    category_seerah: 'Seerah',
    category_general: 'General',
    category_other: 'Other',

    // Common
    common_listen: 'Listen',
    common_download: 'Download',
    common_duration: 'Duration',
    common_date: 'Date',
    common_views: 'views',
    common_loading: 'Loading...',
    common_error: 'An error occurred',
    common_not_found: 'Not found',

    // Footer
    footer_about: 'About',
    footer_about_text: 'Duroos Islamic Lectures Platform - Spreading Islamic knowledge',
    footer_quick_links: 'Quick Links',
    footer_categories: 'Categories',
    footer_rights: 'All rights reserved',

    // Breadcrumbs
    breadcrumb_home: 'Home',
    breadcrumb_lectures: 'Lectures',
    breadcrumb_sheikhs: 'Sheikhs',
    breadcrumb_series: 'Series',

    // Admin - Navigation
    admin_title: 'Admin Panel',
    admin_dashboard: 'Dashboard',
    admin_upload: 'Upload',
    admin_bulk_upload: 'Bulk Upload',
    admin_manage: 'Manage',
    admin_schedule: 'Schedule',
    admin_analytics: 'Analytics',
    admin_logout: 'Logout',
    admin_users: 'Users',
    admin_sheikhs: 'Sheikhs',
    admin_lectures: 'Lectures',
    admin_series: 'Series',

    // Admin - Dashboard
    admin_total_lectures: 'Total Lectures',
    admin_published: 'Published',
    admin_unpublished: 'Unpublished',
    admin_total_plays: 'Total Plays',
    admin_total_downloads: 'Total Downloads',
    admin_total_sheikhs: 'Total Sheikhs',
    admin_total_series: 'Total Series',
    admin_recent_lectures: 'Recent Lectures',
    admin_no_lectures: 'No lectures',

    // Admin - Table Headers
    admin_th_title: 'Title',
    admin_th_title_ar: 'Title (Arabic)',
    admin_th_title_en: 'Title (English)',
    admin_th_sheikh: 'Sheikh',
    admin_th_series: 'Series',
    admin_th_status: 'Status',
    admin_th_plays: 'Plays',
    admin_th_downloads: 'Downloads',
    admin_th_date: 'Date',
    admin_th_actions: 'Actions',
    admin_th_category: 'Category',
    admin_th_duration: 'Duration',
    admin_th_audio: 'Audio',
    admin_th_email: 'Email',
    admin_th_role: 'Role',
    admin_th_last_login: 'Last Login',
    admin_th_active: 'Active',

    // Admin - Status Badges
    admin_status_published: 'Published',
    admin_status_draft: 'Draft',
    admin_status_visible: 'Visible',
    admin_status_hidden: 'Hidden',
    admin_status_active: 'Active',
    admin_status_inactive: 'Inactive',
    admin_status_verified: 'Verified',
    admin_status_unverified: 'Unverified',

    // Admin - Buttons
    admin_btn_save: 'Save',
    admin_btn_cancel: 'Cancel',
    admin_btn_delete: 'Delete',
    admin_btn_edit: 'Edit',
    admin_btn_view: 'View',
    admin_btn_add: 'Add',
    admin_btn_create: 'Create',
    admin_btn_update: 'Update',
    admin_btn_upload: 'Upload',
    admin_btn_search: 'Search',
    admin_btn_filter: 'Filter',
    admin_btn_reset: 'Reset',
    admin_btn_back: 'Back',
    admin_btn_next: 'Next',
    admin_btn_previous: 'Previous',
    admin_btn_publish: 'Publish',
    admin_btn_unpublish: 'Unpublish',
    admin_btn_toggle: 'Toggle',

    // Admin - Forms
    admin_form_title_ar: 'Title (Arabic)',
    admin_form_title_en: 'Title (English)',
    admin_form_description_ar: 'Description (Arabic)',
    admin_form_description_en: 'Description (English)',
    admin_form_sheikh: 'Select Sheikh',
    admin_form_series: 'Select Series',
    admin_form_category: 'Category',
    admin_form_date_recorded: 'Date Recorded',
    admin_form_lecture_number: 'Lecture Number',
    admin_form_location: 'Location',
    admin_form_notes: 'Notes',
    admin_form_audio_file: 'Audio File',
    admin_form_select: 'Select...',
    admin_form_none: 'None',
    admin_form_required: 'Required',
    admin_form_optional: 'Optional',

    // Admin - Messages
    admin_msg_saved: 'Saved successfully',
    admin_msg_deleted: 'Deleted successfully',
    admin_msg_updated: 'Updated successfully',
    admin_msg_created: 'Created successfully',
    admin_msg_error: 'An error occurred',
    admin_msg_confirm_delete: 'Are you sure you want to delete?',
    admin_msg_no_results: 'No results found',
    admin_msg_loading: 'Loading...',
    admin_msg_uploading: 'Uploading...',

    // Admin - Upload Page
    admin_upload_title: 'Upload New Lecture',
    admin_upload_drag_drop: 'Drag and drop file here or click to select',
    admin_upload_supported: 'Supported files: MP3, M4A, WAV',
    admin_upload_max_size: 'Maximum size',
    admin_upload_progress: 'Uploading',

    // Admin - Manage Page
    admin_manage_title: 'Content Management',
    admin_manage_quick_actions: 'Quick Actions',
    admin_manage_duration_status: 'Duration Status',
    admin_manage_no_audio: 'No Audio',

    // Admin - Schedule
    admin_schedule_title: 'Weekly Class Schedule',
    admin_schedule_add: 'Add Class',
    admin_schedule_day: 'Day',
    admin_schedule_time: 'Time',
    admin_schedule_location: 'Location',
    admin_schedule_type: 'Type',
    admin_schedule_online: 'Online',
    admin_schedule_in_person: 'In Person',

    // Admin - Analytics
    admin_analytics_title: 'Analytics & Statistics',
    admin_analytics_summary: 'Summary',
    admin_analytics_top_lectures: 'Top Lectures by Plays',
    admin_analytics_top_downloads: 'Top Lectures by Downloads',
    admin_analytics_daily_views: 'Daily Views',
    admin_analytics_settings: 'Display Settings',

    // Admin - Users
    admin_users_title: 'User Management',
    admin_users_add: 'Add User',
    admin_users_role_admin: 'Admin',
    admin_users_role_editor: 'Editor',

    // Admin - Sheikhs
    admin_sheikhs_title: 'Sheikh Management',
    admin_sheikhs_add: 'Add Sheikh',
    admin_sheikhs_name_ar: 'Name (Arabic)',
    admin_sheikhs_name_en: 'Name (English)',
    admin_sheikhs_honorific: 'Honorific',
    admin_sheikhs_bio: 'Biography',
    admin_sheikhs_photo: 'Photo',
    admin_sheikhs_lecture_count: 'Lecture Count',

    // Admin - Series
    admin_series_title: 'Series Management',
    admin_series_add: 'Add Series',
    admin_series_reorder: 'Reorder Lectures',
    admin_series_unassociated: 'Unassociated Lectures',
    admin_series_assign: 'Assign to Series',
    admin_series_visibility: 'Visibility',
    admin_series_book_author: 'Book Author',

    // Admin - Articles
    admin_articles: 'Articles',
    admin_total_articles: 'Total Articles',
    admin_articles_title: 'Article Management',
    admin_articles_add: 'Add Article',
    admin_articles_manage: 'Manage Articles',
    admin_articles_edit: 'Edit Article',
    admin_articles_type: 'Type',
    admin_articles_type_asdaa: 'Asdaa',
    admin_articles_type_telegram: 'Telegram',
    admin_articles_summary: 'Summary',
    admin_articles_content: 'Content',
    admin_articles_source_url: 'Source URL',
    admin_articles_published_at: 'Published Date',
    admin_articles_no_articles: 'No articles found',
    admin_articles_bulk_delete: 'Delete Selected',
    admin_articles_bulk_publish: 'Publish Selected',
    admin_articles_bulk_unpublish: 'Unpublish Selected',

    // Admin - Article Editors
    admin_article_editors: 'Article Editors',
    admin_article_editors_manage: 'Manage Editors',

    // Admin - Days of Week
    admin_day_sunday: 'Sunday',
    admin_day_monday: 'Monday',
    admin_day_tuesday: 'Tuesday',
    admin_day_wednesday: 'Wednesday',
    admin_day_thursday: 'Thursday',
    admin_day_friday: 'Friday',
    admin_day_saturday: 'Saturday',

    // Admin - Login Page
    admin_login_title: 'Admin Login',
    admin_login_subtitle: 'Duroos Islamic Lectures Platform',
    admin_login_google: 'Sign in with Google',
    admin_login_admin_only: 'Admin Access Only',
    admin_login_whitelist_info: 'Only whitelisted email addresses can access the admin panel.',
    admin_login_error_unauthorized: 'Your email is not authorized to access the admin panel.',
    admin_login_error_inactive: 'Your admin account has been deactivated.',

    // Site Notice Banner
    notice_message: 'Notice: The site server was affected by technical issues and is being restored. Data currently available is up to 22 Ramadan. All recent and past audio remain available on our',
    notice_telegram: 'Telegram channel',

    // Admin - Notice Banner
    admin_notice_banner_title: 'Notice Banner Settings',
  }
};

/**
 * Get translation for a key in the specified locale
 * @param {string} locale - 'ar' or 'en'
 * @param {string} key - Translation key
 * @returns {string} Translated text or key if not found
 */
function t(locale, key) {
  if (!translations[locale]) {
    return key;
  }
  return translations[locale][key] || key;
}

// Cache for notice banner settings (refreshed every 60 seconds)
let noticeBannerCache = null;
let noticeBannerCacheTime = 0;
const NOTICE_BANNER_CACHE_TTL = 60000; // 60 seconds

/**
 * Get notice banner settings with caching
 */
async function getNoticeBannerSettings() {
  const now = Date.now();
  if (noticeBannerCache && (now - noticeBannerCacheTime) < NOTICE_BANNER_CACHE_TTL) {
    return noticeBannerCache;
  }

  try {
    const SiteSettings = require('../models/SiteSettings');
    const settings = await SiteSettings.getSettings();
    noticeBannerCache = settings.noticeBanner || {
      enabled: true,
      messageAr: translations.ar.notice_message,
      messageEn: translations.en.notice_message,
      linkUrl: 'https://t.me/daririhasan',
      linkTextAr: translations.ar.notice_telegram,
      linkTextEn: translations.en.notice_telegram
    };
    noticeBannerCacheTime = now;
    return noticeBannerCache;
  } catch (error) {
    // Return default settings if database is unavailable
    return {
      enabled: true,
      messageAr: translations.ar.notice_message,
      messageEn: translations.en.notice_message,
      linkUrl: 'https://t.me/daririhasan',
      linkTextAr: translations.ar.notice_telegram,
      linkTextEn: translations.en.notice_telegram
    };
  }
}

/**
 * Invalidate notice banner cache (call when settings are updated)
 */
function invalidateNoticeBannerCache() {
  noticeBannerCache = null;
  noticeBannerCacheTime = 0;
}

// Maintenance mode cache
let maintenanceModeCache = null;
let maintenanceModeCacheTime = 0;
const MAINTENANCE_MODE_CACHE_TTL = 60000; // 60 seconds

/**
 * Get maintenance mode settings with caching
 */
async function getMaintenanceModeSettings() {
  const now = Date.now();
  if (maintenanceModeCache && (now - maintenanceModeCacheTime) < MAINTENANCE_MODE_CACHE_TTL) {
    return maintenanceModeCache;
  }

  try {
    const SiteSettings = require('../models/SiteSettings');
    const settings = await SiteSettings.getSettings();
    maintenanceModeCache = settings.maintenanceMode || {
      enabled: false,
      titleAr: 'الموقع تحت الصيانة',
      titleEn: 'Site Under Maintenance',
      messageAr: 'نعمل حالياً على تحسين الموقع. يرجى العودة قريباً.',
      messageEn: 'We are currently improving the site. Please check back soon.',
      telegramUrl: 'https://t.me/daririhasan',
      telegramTextAr: 'تابعنا على تيليجرام للتحديثات',
      telegramTextEn: 'Follow us on Telegram for updates'
    };
    maintenanceModeCacheTime = now;
    return maintenanceModeCache;
  } catch (error) {
    // Return default settings if database is unavailable
    return {
      enabled: false,
      titleAr: 'الموقع تحت الصيانة',
      titleEn: 'Site Under Maintenance',
      messageAr: 'نعمل حالياً على تحسين الموقع.',
      messageEn: 'We are currently improving the site.',
      telegramUrl: 'https://t.me/daririhasan',
      telegramTextAr: 'تابعنا على تيليجرام',
      telegramTextEn: 'Follow us on Telegram'
    };
  }
}

/**
 * Invalidate maintenance mode cache (call when settings are updated)
 */
function invalidateMaintenanceModeCache() {
  maintenanceModeCache = null;
  maintenanceModeCacheTime = 0;
}

/**
 * Middleware to set locale and inject translation function into templates
 */
async function i18nMiddleware(req, res, next) {
  // Get locale from query, cookie, or default to Arabic
  const locale = req.query.lang || req.cookies?.locale || 'ar';

  // Validate locale
  const validLocale = ['ar', 'en'].includes(locale) ? locale : 'ar';

  // Set locale in response locals for templates
  res.locals.locale = validLocale;
  res.locals.isRTL = validLocale === 'ar';

  // Set current path for canonical URLs (without query params)
  res.locals.currentPath = req.path;

  // Inject translation function
  res.locals.t = (key) => t(validLocale, key);

  // Inject category translation function
  res.locals.translateCategory = (category) => translateCategory(category, validLocale);

  // Inject Hijri date formatting function
  res.locals.formatHijriDate = (dateStr) => formatHijriDate(dateStr, validLocale);

  // Inject Arabic numerals function
  res.locals.toArabicNumerals = toArabicNumerals;

  // Inject all translations for client-side use
  res.locals.translations = translations[validLocale];

  // Inject notice banner settings
  try {
    res.locals.noticeBanner = await getNoticeBannerSettings();
  } catch (error) {
    res.locals.noticeBanner = { enabled: false };
  }

  // Inject maintenance mode settings
  try {
    res.locals.maintenanceMode = await getMaintenanceModeSettings();
  } catch (error) {
    res.locals.maintenanceMode = { enabled: false };
  }

  next();
}

/**
 * Get category translation based on locale
 * Handles the case where category is stored in English but needs Arabic display
 */
const categoryMap = {
  'Aqeedah': { ar: 'العقيدة', en: 'Aqeedah' },
  'Fiqh': { ar: 'الفقه', en: 'Fiqh' },
  'Tafsir': { ar: 'التفسير', en: 'Tafsir' },
  'Hadith': { ar: 'الحديث', en: 'Hadith' },
  'Seerah': { ar: 'السيرة', en: 'Seerah' },
  'General': { ar: 'عام', en: 'General' },
  'Other': { ar: 'أخرى', en: 'Other' },
  'Khutbah': { ar: 'خطب', en: 'Khutbah' },
  'Akhlaq': { ar: 'الأخلاق', en: 'Akhlaq' }
};

function translateCategory(category, locale) {
  if (!category) return '';
  const mapping = categoryMap[category];
  if (mapping) {
    return mapping[locale] || mapping['en'] || category;
  }
  return category;
}

/**
 * Convert Western numerals to Arabic-Indic numerals
 * @param {string|number} num - Number to convert
 * @returns {string} Arabic-Indic numeral string
 */
function toArabicNumerals(num) {
  if (num === null || num === undefined) return '';
  const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return String(num).replace(/[0-9]/g, (d) => arabicNumerals[parseInt(d)]);
}

/**
 * Format Hijri date for display
 * @param {string} dateStr - Date string in format "DD/MM/YYYY" or similar
 * @param {string} locale - 'ar' or 'en'
 * @returns {string} Formatted date string
 */
function formatHijriDate(dateStr, locale) {
  if (!dateStr) return '';

  // Try to parse different date formats
  let day, month, year;

  // Handle "YYYY/MM/DD" format (stored by convertToHijri)
  const yearFirstSlashMatch = dateStr.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (yearFirstSlashMatch) {
    year = yearFirstSlashMatch[1];
    month = yearFirstSlashMatch[2];
    day = yearFirstSlashMatch[3];
  }

  // Handle "DD/MM/YYYY" format
  if (!day) {
    const slashMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (slashMatch) {
      day = slashMatch[1];
      month = slashMatch[2];
      year = slashMatch[3];
    }
  }

  // Handle "YYYY-MM-DD" format
  if (!day) {
    const dashMatch = dateStr.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (dashMatch) {
      year = dashMatch[1];
      month = dashMatch[2];
      day = dashMatch[3];
    }
  }

  if (!day || !month || !year) {
    // Return original if can't parse
    return locale === 'ar' ? toArabicNumerals(dateStr) : dateStr;
  }

  if (locale === 'ar') {
    // Arabic format: ٢٨ / ٧ / ١٤٤٧
    return `${toArabicNumerals(day)} / ${toArabicNumerals(month)} / ${toArabicNumerals(year)}`;
  } else {
    // English format: 28/7/1447
    return `${day}/${month}/${year}`;
  }
}

/**
 * Middleware for admin pages - supports language toggle with cookie persistence
 * Uses 'admin_locale' cookie to store admin language preference
 */
function adminI18nMiddleware(req, res, next) {
  // Get locale from query param (for switching), or cookie, or default to English
  let locale = req.query.lang || req.cookies?.admin_locale || 'en';

  // Handle language switch via query param
  if (req.query.lang && ['ar', 'en'].includes(req.query.lang)) {
    // Set cookie for 30 days
    res.cookie('admin_locale', req.query.lang, {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax'
    });
    locale = req.query.lang;
  }

  // Validate locale
  const validLocale = ['ar', 'en'].includes(locale) ? locale : 'en';

  // Set locale in response locals for templates
  res.locals.adminLocale = validLocale;
  res.locals.adminIsRTL = validLocale === 'ar';

  // Inject translation function for admin
  res.locals.t = (key) => t(validLocale, key);

  // Inject category translation function
  res.locals.translateCategory = (category) => translateCategory(category, validLocale);

  // Inject all translations for client-side use
  res.locals.translations = translations[validLocale];

  // Inject directions for CSS
  res.locals.adminDir = validLocale === 'ar' ? 'rtl' : 'ltr';
  res.locals.adminTextAlign = validLocale === 'ar' ? 'right' : 'left';
  res.locals.adminTextAlignOpposite = validLocale === 'ar' ? 'left' : 'right';

  next();
}

module.exports = {
  t,
  i18nMiddleware,
  adminI18nMiddleware,
  translations,
  translateCategory,
  categoryMap,
  toArabicNumerals,
  formatHijriDate,
  invalidateNoticeBannerCache,
  invalidateMaintenanceModeCache
};
