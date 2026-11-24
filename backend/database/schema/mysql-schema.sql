-- IntelligenceHR — database schema (MySQL / InnoDB / utf8mb4 / utf8mb4_unicode_ci)
-- Schema only — no data, no seeds, no credentials.
--
-- HOW THIS FILE WAS PRODUCED (Saad, 24 Nov 2026): the preferred method
-- is `php artisan schema:dump` against the live database. That was NOT
-- possible here — the build agent has no access to the live database
-- environment and may not run code locally — so this file was GENERATED
-- FROM THE MIGRATION FILES (backend/database/migrations/), P1 included.
-- The migrations remain authoritative: if this file and a migration ever
-- disagree, the migration wins and this file must be regenerated.
-- Regenerate it (from the migrations, or via schema:dump when a live DB
-- is reachable) whenever migrations change.
--
-- State: final state after migrations 0001_01_01_000000 through
-- 2026_11_24_000010 (Payroll P1: tenancy foundation + core skeleton).
-- NOTE: the migrations define almost no foreign keys. Only the FK
-- constraints listed below exist; all other relations are plain
-- indexed columns with no DB-level referential integrity.

CREATE TABLE `users` (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `email_verified_at` TIMESTAMP NULL,
  `password` VARCHAR(255) NOT NULL,
  `roles` JSON NULL,
  `employee_id` BIGINT UNSIGNED NULL,
  `tenant_id` BIGINT UNSIGNED NULL,
  `platform_admin` TINYINT(1) NOT NULL DEFAULT 0,
  `remember_token` VARCHAR(100) NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_unique` (`email`),
  INDEX `users_tenant_id_index` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `password_reset_tokens` (
  `email` VARCHAR(255) NOT NULL,
  `token` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP NULL,
  PRIMARY KEY (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `sessions` (
  `id` VARCHAR(255) NOT NULL,
  `user_id` CHAR(36) NULL,
  `ip_address` VARCHAR(45) NULL,
  `user_agent` TEXT NULL,
  `payload` LONGTEXT NOT NULL,
  `last_activity` INT NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `sessions_user_id_index` (`user_id`),
  INDEX `sessions_last_activity_index` (`last_activity`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `departments` (
  `id` VARCHAR(255) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `code` VARCHAR(255) NULL,
  `description` TEXT NULL,
  `manager_id` BIGINT UNSIGNED NULL,
  `employee_count` INT NOT NULL DEFAULT 0,
  `budget` DECIMAL(15,2) NULL,
  `parent_id` VARCHAR(255) NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `tenant_id` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  INDEX `departments_tenant_id_index` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `employees` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` CHAR(36) NULL,
  `first_name` VARCHAR(255) NOT NULL,
  `last_name` VARCHAR(255) NOT NULL,
  `job_title` VARCHAR(255) NULL,
  `department_id` VARCHAR(255) NULL,
  `team_id` VARCHAR(255) NULL,
  `position_id` VARCHAR(255) NULL,
  `position_title` VARCHAR(255) NULL,
  `manager_id` BIGINT UNSIGNED NULL,
  `employment_type` VARCHAR(255) NULL,
  `status` VARCHAR(255) NOT NULL DEFAULT 'Active',
  `location` VARCHAR(255) NULL,
  `country` VARCHAR(2) NULL,
  `joined_at` DATE NULL,
  `email` VARCHAR(255) NULL,
  `gender` VARCHAR(255) NULL,
  `marital_status` VARCHAR(255) NULL,
  `number_of_children` INT NULL,
  `national_id` VARCHAR(255) NULL,
  `cnss_number` VARCHAR(255) NULL,
  `spouse_dependent` TINYINT(1) NOT NULL DEFAULT 0,
  `dependants_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `nationality_id` INT NULL,
  `passport_number` VARCHAR(255) NULL,
  `passport_validity_date` DATE NULL,
  `personal_phone` VARCHAR(255) NULL,
  `professional_phone` VARCHAR(255) NULL,
  `personal_info_completed_at` TIMESTAMP NULL,
  `personal_info_dismissed_until` TIMESTAMP NULL,
  `emergency_contact_name` VARCHAR(255) NULL,
  `emergency_contact_phone` VARCHAR(255) NULL,
  `emergency_contact_relationship` VARCHAR(255) NULL,
  `onboarding_status` VARCHAR(255) NULL,
  `onboarding_approval_status` VARCHAR(255) NULL,
  `offboarding_status` VARCHAR(255) NULL,
  `offboarding_approval_status` VARCHAR(255) NULL,
  `tenant_id` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `employees_email_unique` (`email`),
  UNIQUE KEY `employees_tenant_id_cnss_number_unique` (`tenant_id`, `cnss_number`),
  INDEX `employees_user_id_index` (`user_id`),
  INDEX `employees_department_id_index` (`department_id`),
  INDEX `employees_manager_id_index` (`manager_id`),
  INDEX `employees_tenant_id_index` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `reporting_relationships` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id` BIGINT UNSIGNED NOT NULL,
  `manager_employee_id` BIGINT UNSIGNED NULL,
  `effective_from` DATE NOT NULL,
  `effective_to` DATE NULL,
  `is_primary` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  INDEX `reporting_relationships_employee_id_index` (`employee_id`),
  INDEX `reporting_relationships_manager_employee_id_index` (`manager_employee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `leave_types` (
  `id` VARCHAR(255) NOT NULL,
  `code` VARCHAR(255) NULL,
  `name_key` VARCHAR(255) NOT NULL,
  `color` VARCHAR(255) NOT NULL DEFAULT '#3b82f6',
  `paid` TINYINT(1) NOT NULL DEFAULT 1,
  `default_entitlement_days` INT NOT NULL DEFAULT 0,
  `carry_over_days` INT NOT NULL DEFAULT 0,
  `requires_approval` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `leave_entitlements` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id` BIGINT UNSIGNED NOT NULL,
  `leave_type_id` VARCHAR(255) NOT NULL,
  `entitlement` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  INDEX `leave_entitlements_employee_id_index` (`employee_id`),
  INDEX `leave_entitlements_leave_type_id_index` (`leave_type_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `leave_requests` (
  `id` CHAR(36) NOT NULL,
  `employee_id` BIGINT UNSIGNED NOT NULL,
  `leave_type_id` VARCHAR(255) NOT NULL,
  `start_date` DATE NOT NULL,
  `end_date` DATE NOT NULL,
  `from_half` VARCHAR(10) NOT NULL DEFAULT 'full',
  `to_half` VARCHAR(10) NOT NULL DEFAULT 'full',
  `duration` DECIMAL(8,2) NOT NULL DEFAULT 0,
  `backup_employee_id` BIGINT UNSIGNED NULL,
  `note` TEXT NULL,
  `status` VARCHAR(255) NOT NULL DEFAULT 'pending',
  `submitted_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  INDEX `leave_requests_employee_id_index` (`employee_id`),
  INDEX `leave_requests_leave_type_id_index` (`leave_type_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `holidays` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `name_key` VARCHAR(255) NULL,
  `date` DATE NOT NULL,
  `days` INT NOT NULL DEFAULT 1,
  `recurring` TINYINT(1) NOT NULL DEFAULT 0,
  `type` VARCHAR(255) NOT NULL DEFAULT 'Public',
  `country` VARCHAR(2) NULL,
  `site` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `onboarding_cases` (
  `id` CHAR(36) NOT NULL,
  `employee_id` BIGINT UNSIGNED NOT NULL,
  `employee_name` VARCHAR(255) NOT NULL,
  `position` VARCHAR(255) NULL,
  `department` VARCHAR(255) NULL,
  `start_date` DATE NULL,
  `stage` VARCHAR(255) NOT NULL DEFAULT 'HR Validation',
  `assignee` VARCHAR(255) NULL,
  `progress` INT NOT NULL DEFAULT 0,
  `status` VARCHAR(255) NOT NULL DEFAULT 'On track',
  `approval_status` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  INDEX `onboarding_cases_employee_id_index` (`employee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `onboarding_tasks` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `onboarding_case_id` CHAR(36) NOT NULL,
  `label_key` VARCHAR(255) NOT NULL,
  `done` TINYINT(1) NOT NULL DEFAULT 0,
  `due_date` DATE NULL,
  `employee_visible` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  INDEX `onboarding_tasks_onboarding_case_id_index` (`onboarding_case_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `offboarding_cases` (
  `id` CHAR(36) NOT NULL,
  `employee_id` BIGINT UNSIGNED NOT NULL,
  `employee_name` VARCHAR(255) NOT NULL,
  `exit_date` DATE NULL,
  `reason` VARCHAR(255) NULL,
  `replacement` VARCHAR(255) NULL,
  `stage` VARCHAR(255) NOT NULL DEFAULT 'HR Validation',
  `progress` INT NOT NULL DEFAULT 0,
  `status` VARCHAR(255) NOT NULL DEFAULT 'On track',
  `approval_status` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  INDEX `offboarding_cases_employee_id_index` (`employee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `employee_documents` (
  `id` CHAR(36) NOT NULL,
  `employee_id` BIGINT UNSIGNED NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `type` VARCHAR(255) NOT NULL DEFAULT 'other',
  `issue_date` DATE NULL,
  `expiry_date` DATE NULL,
  `status` VARCHAR(255) NOT NULL DEFAULT 'pending',
  `has_file` TINYINT(1) NOT NULL DEFAULT 0,
  `file_path` VARCHAR(255) NULL,
  `mime_type` VARCHAR(255) NULL,
  `file_size` BIGINT UNSIGNED NULL,
  `review_comment` TEXT NULL,
  `reviewed_at` TIMESTAMP NULL,
  `uploaded_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  INDEX `employee_documents_employee_id_index` (`employee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `workflow_templates` (
  `id` CHAR(36) NOT NULL,
  `key` VARCHAR(255) NOT NULL,
  `module` VARCHAR(255) NOT NULL,
  `resource_type` VARCHAR(255) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `workflow_templates_key_unique` (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `workflow_template_versions` (
  `id` CHAR(36) NOT NULL,
  `workflow_template_id` CHAR(36) NOT NULL,
  `version_number` INT NOT NULL DEFAULT 1,
  `status` VARCHAR(255) NOT NULL DEFAULT 'draft',
  `steps` JSON NULL,
  `published_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  INDEX `workflow_template_versions_workflow_template_id_index` (`workflow_template_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `workflow_instances` (
  `id` CHAR(36) NOT NULL,
  `initiator_user_id` CHAR(36) NOT NULL,
  `resource_type` VARCHAR(255) NOT NULL,
  `resource_id` VARCHAR(255) NOT NULL,
  `status` VARCHAR(255) NOT NULL DEFAULT 'pending',
  `steps` JSON NULL,
  `current_step` INT NOT NULL DEFAULT 0,
  `submitted_at` TIMESTAMP NULL,
  `completed_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  INDEX `workflow_instances_initiator_user_id_index` (`initiator_user_id`),
  INDEX `workflow_instances_resource_id_index` (`resource_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `workflow_actions` (
  `id` CHAR(36) NOT NULL,
  `workflow_instance_id` CHAR(36) NOT NULL,
  `assignment_id` VARCHAR(255) NULL,
  `action` VARCHAR(255) NOT NULL,
  `comment` TEXT NULL,
  `actor_user_id` CHAR(36) NOT NULL,
  `occurred_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  INDEX `workflow_actions_workflow_instance_id_index` (`workflow_instance_id`),
  INDEX `workflow_actions_actor_user_id_index` (`actor_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `workflow_delegations` (
  `id` CHAR(36) NOT NULL,
  `delegator_user_id` CHAR(36) NOT NULL,
  `delegate_user_id` CHAR(36) NOT NULL,
  `approval_assignment_id` VARCHAR(255) NULL,
  `starts_at` TIMESTAMP NULL,
  `ends_at` TIMESTAMP NULL,
  `revoked_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  INDEX `workflow_delegations_delegator_user_id_index` (`delegator_user_id`),
  INDEX `workflow_delegations_delegate_user_id_index` (`delegate_user_id`),
  INDEX `workflow_delegations_approval_assignment_id_index` (`approval_assignment_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `notifications` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NULL,
  `title` VARCHAR(255) NOT NULL,
  `body` TEXT NULL,
  `type` VARCHAR(255) NOT NULL DEFAULT 'info',
  `resource_type` VARCHAR(255) NULL,
  `resource_id` VARCHAR(255) NULL,
  `read_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  INDEX `notifications_user_id_index` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `audit_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` CHAR(36) NULL,
  `user_name` VARCHAR(255) NULL,
  `action` VARCHAR(255) NOT NULL,
  `resource_type` VARCHAR(255) NULL,
  `resource_id` VARCHAR(255) NULL,
  `details` JSON NULL,
  `tenant_id` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  INDEX `audit_logs_user_id_index` (`user_id`),
  INDEX `audit_logs_action_index` (`action`),
  INDEX `audit_logs_resource_type_index` (`resource_type`),
  INDEX `audit_logs_tenant_id_index` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `calendar_events` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` CHAR(36) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `type` VARCHAR(255) NOT NULL DEFAULT 'Company event',
  `start_date` DATE NOT NULL,
  `end_date` DATE NOT NULL,
  `note` TEXT NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  INDEX `calendar_events_user_id_index` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `training_courses` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `category` VARCHAR(255) NOT NULL DEFAULT 'General',
  `duration_hours` INT UNSIGNED NOT NULL DEFAULT 0,
  `provider` VARCHAR(255) NULL,
  `status` VARCHAR(255) NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `training_enrollments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id` BIGINT UNSIGNED NOT NULL,
  `course_id` BIGINT UNSIGNED NOT NULL,
  `status` VARCHAR(255) NOT NULL DEFAULT 'enrolled',
  `progress` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `completed_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `training_enrollments_employee_id_course_id_unique` (`employee_id`, `course_id`),
  INDEX `training_enrollments_employee_id_index` (`employee_id`),
  INDEX `training_enrollments_course_id_index` (`course_id`),
  CONSTRAINT `training_enrollments_course_id_foreign` FOREIGN KEY (`course_id`) REFERENCES `training_courses` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `attendance_records` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id` BIGINT UNSIGNED NOT NULL,
  `date` DATE NOT NULL,
  `check_in` TIME NULL,
  `check_out` TIME NULL,
  `status` VARCHAR(255) NOT NULL DEFAULT 'present',
  `hours_worked` DECIMAL(4,2) NULL,
  `validated` TINYINT(1) NOT NULL DEFAULT 0,
  `validated_by` BIGINT UNSIGNED NULL,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `attendance_records_employee_id_date_unique` (`employee_id`, `date`),
  INDEX `attendance_records_employee_id_index` (`employee_id`),
  INDEX `attendance_records_date_index` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `review_cycles` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(255) NOT NULL,
  `period_start` DATE NOT NULL,
  `period_end` DATE NOT NULL,
  `status` VARCHAR(255) NOT NULL DEFAULT 'draft',
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `performance_reviews` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id` BIGINT UNSIGNED NOT NULL,
  `reviewer_id` BIGINT UNSIGNED NULL,
  `cycle_id` BIGINT UNSIGNED NOT NULL,
  `rating` TINYINT UNSIGNED NULL,
  `strengths` TEXT NULL,
  `improvements` TEXT NULL,
  `feedback` TEXT NULL,
  `status` VARCHAR(255) NOT NULL DEFAULT 'draft',
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  INDEX `performance_reviews_employee_id_index` (`employee_id`),
  INDEX `performance_reviews_reviewer_id_index` (`reviewer_id`),
  INDEX `performance_reviews_cycle_id_index` (`cycle_id`),
  CONSTRAINT `performance_reviews_cycle_id_foreign` FOREIGN KEY (`cycle_id`) REFERENCES `review_cycles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `goals` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id` BIGINT UNSIGNED NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `target_date` DATE NULL,
  `status` VARCHAR(255) NOT NULL DEFAULT 'not_started',
  `progress` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  INDEX `goals_employee_id_index` (`employee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `jobs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(255) NOT NULL,
  `department_id` VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `location` VARCHAR(255) NOT NULL DEFAULT 'Casablanca',
  `employment_type` VARCHAR(255) NOT NULL DEFAULT 'Full-time',
  `status` VARCHAR(255) NOT NULL DEFAULT 'open',
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  INDEX `jobs_department_id_index` (`department_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `candidates` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(255) NULL,
  `cv_path` VARCHAR(255) NULL,
  `cv_mime` VARCHAR(255) NULL,
  `cv_size` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `candidates_email_unique` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `job_applications` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `job_id` BIGINT UNSIGNED NOT NULL,
  `candidate_id` BIGINT UNSIGNED NOT NULL,
  `stage` VARCHAR(255) NOT NULL DEFAULT 'applied',
  `notes` TEXT NULL,
  `onboarding_case_id` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `job_applications_job_id_candidate_id_unique` (`job_id`, `candidate_id`),
  INDEX `job_applications_job_id_index` (`job_id`),
  INDEX `job_applications_candidate_id_index` (`candidate_id`),
  INDEX `job_applications_onboarding_case_id_index` (`onboarding_case_id`),
  CONSTRAINT `job_applications_job_id_foreign` FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`) ON DELETE CASCADE,
  CONSTRAINT `job_applications_candidate_id_foreign` FOREIGN KEY (`candidate_id`) REFERENCES `candidates` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `interviews` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `application_id` BIGINT UNSIGNED NOT NULL,
  `scheduled_at` DATETIME NOT NULL,
  `interviewer` VARCHAR(255) NULL,
  `notes` TEXT NULL,
  `outcome` VARCHAR(255) NOT NULL DEFAULT 'pending',
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  INDEX `interviews_application_id_index` (`application_id`),
  CONSTRAINT `interviews_application_id_foreign` FOREIGN KEY (`application_id`) REFERENCES `job_applications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------
-- Payroll P1 (24 Nov 2026) — tenancy foundation + core skeleton.
-- Migration 2026_11_24_000008 (tenants + tenant_id backfill on
-- users/employees/departments/audit_logs), 2026_11_24_000009 (catalog
-- tables), 2026_11_24_000010 (run tables).
-- Tables are shown in their FINAL state (columns added by 000008 are
-- already merged into the tables above).
-- ------------------------------------------------------------------

CREATE TABLE `tenants` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `slug` VARCHAR(255) NOT NULL,
  `status` VARCHAR(255) NOT NULL DEFAULT 'active',
  `default_jurisdiction` VARCHAR(255) NULL,
  `default_currency` VARCHAR(255) NOT NULL DEFAULT 'MAD',
  `default_languages` JSON NULL,
  `created_by` CHAR(36) NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenants_slug_unique` (`slug`),
  INDEX `tenants_created_by_index` (`created_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tenant_jurisdictions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `jurisdiction_code` VARCHAR(255) NOT NULL,
  `profile_version` VARCHAR(255) NOT NULL,
  `status` VARCHAR(255) NOT NULL DEFAULT 'disabled',
  `enabled_at` DATETIME NULL,
  `disabled_at` DATETIME NULL,
  `enabled_by` CHAR(36) NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenant_jurisdictions_tenant_id_jurisdiction_code_unique` (`tenant_id`, `jurisdiction_code`),
  INDEX `tenant_jurisdictions_tenant_id_index` (`tenant_id`),
  INDEX `tenant_jurisdictions_enabled_by_index` (`enabled_by`),
  CONSTRAINT `tenant_jurisdictions_tenant_id_foreign` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `payroll_legal_parameters` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `jurisdiction_code` VARCHAR(255) NOT NULL,
  `profile_version` VARCHAR(255) NOT NULL,
  `key` VARCHAR(255) NOT NULL,
  `value` DECIMAL(14,4) NOT NULL,
  `value_type` VARCHAR(255) NOT NULL,
  `valid_from` DATE NOT NULL,
  `valid_to` DATE NULL,
  `source` VARCHAR(255) NOT NULL,
  `confidence` VARCHAR(255) NOT NULL,
  `source_url` VARCHAR(255) NULL,
  `notes` TEXT NULL,
  `created_by` CHAR(36) NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `payroll_legal_parameters_jurisdiction_code_profile_version_key_valid_from_unique` (`jurisdiction_code`, `profile_version`, `key`, `valid_from`),
  INDEX `payroll_legal_parameters_jurisdiction_code_index` (`jurisdiction_code`),
  INDEX `payroll_legal_parameters_key_index` (`key`),
  INDEX `payroll_legal_parameters_created_by_index` (`created_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `payroll_salary_components` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `code` VARCHAR(255) NOT NULL,
  `name_fr` VARCHAR(255) NULL,
  `name_ar` VARCHAR(255) NULL,
  `name_en` VARCHAR(255) NULL,
  `category` VARCHAR(255) NOT NULL,
  `cnss_subject` TINYINT(1) NOT NULL DEFAULT 1,
  `ir_subject` TINYINT(1) NOT NULL DEFAULT 1,
  `cap_type` VARCHAR(255) NOT NULL DEFAULT 'none',
  `cap_value` DECIMAL(12,4) NULL,
  `counts_toward_tax_abatement` TINYINT(1) NOT NULL DEFAULT 0,
  `is_system` TINYINT(1) NOT NULL DEFAULT 0,
  `suggested_by_profile` VARCHAR(255) NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `effective_from` DATE NULL,
  `effective_to` DATE NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `payroll_salary_components_tenant_id_code_unique` (`tenant_id`, `code`),
  INDEX `payroll_salary_components_tenant_id_index` (`tenant_id`),
  CONSTRAINT `payroll_salary_components_tenant_id_foreign` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `payroll_salary_structures` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `employee_id` BIGINT UNSIGNED NOT NULL,
  `effective_from` DATE NOT NULL,
  `effective_to` DATE NULL,
  `base_salary` DECIMAL(12,2) NOT NULL,
  `contractual_hours_month` INT NOT NULL DEFAULT 191,
  `employment_type` VARCHAR(255) NOT NULL DEFAULT 'Full-time',
  `notes` TEXT NULL,
  `created_by` CHAR(36) NULL,
  `updated_by` CHAR(36) NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  INDEX `payroll_salary_structures_tenant_id_index` (`tenant_id`),
  INDEX `payroll_salary_structures_employee_id_index` (`employee_id`),
  INDEX `payroll_salary_structures_employee_id_effective_from_index` (`employee_id`, `effective_from`),
  INDEX `payroll_salary_structures_created_by_index` (`created_by`),
  INDEX `payroll_salary_structures_updated_by_index` (`updated_by`),
  CONSTRAINT `payroll_salary_structures_tenant_id_foreign` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `payroll_structure_lines` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `salary_structure_id` BIGINT UNSIGNED NOT NULL,
  `component_id` BIGINT UNSIGNED NULL,
  `component_code` VARCHAR(255) NULL,
  `amount` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  INDEX `payroll_structure_lines_tenant_id_index` (`tenant_id`),
  INDEX `payroll_structure_lines_salary_structure_id_index` (`salary_structure_id`),
  INDEX `payroll_structure_lines_component_id_index` (`component_id`),
  CONSTRAINT `payroll_structure_lines_tenant_id_foreign` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `payroll_structure_lines_salary_structure_id_foreign` FOREIGN KEY (`salary_structure_id`) REFERENCES `payroll_salary_structures` (`id`) ON DELETE CASCADE,
  CONSTRAINT `payroll_structure_lines_component_id_foreign` FOREIGN KEY (`component_id`) REFERENCES `payroll_salary_components` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `payroll_runs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `jurisdiction_code` VARCHAR(255) NULL,
  `jurisdiction_profile_version` VARCHAR(255) NULL,
  `client_config_version` INT NULL,
  `component_catalog_version` INT NULL,
  `period_year` INT NOT NULL,
  `period_month` INT NOT NULL,
  `period_start` DATE NOT NULL,
  `period_end` DATE NOT NULL,
  `scope_type` VARCHAR(255) NOT NULL DEFAULT 'all',
  `scope_id` VARCHAR(255) NULL,
  `status` VARCHAR(255) NOT NULL DEFAULT 'draft',
  `type` VARCHAR(255) NOT NULL DEFAULT 'normal',
  `totals` JSON NULL,
  `created_by` CHAR(36) NULL,
  `updated_by` CHAR(36) NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  INDEX `payroll_runs_tenant_id_index` (`tenant_id`),
  INDEX `payroll_runs_tenant_id_period_year_period_month_index` (`tenant_id`, `period_year`, `period_month`),
  INDEX `payroll_runs_created_by_index` (`created_by`),
  INDEX `payroll_runs_updated_by_index` (`updated_by`),
  CONSTRAINT `payroll_runs_tenant_id_foreign` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `payroll_payslips` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `payroll_run_id` BIGINT UNSIGNED NOT NULL,
  `employee_id` BIGINT UNSIGNED NOT NULL,
  `period_year` INT NOT NULL,
  `period_month` INT NOT NULL,
  `calculation_json` JSON NOT NULL,
  `pdf_path` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `payroll_payslips_payroll_run_id_employee_id_unique` (`payroll_run_id`, `employee_id`),
  INDEX `payroll_payslips_tenant_id_index` (`tenant_id`),
  INDEX `payroll_payslips_payroll_run_id_index` (`payroll_run_id`),
  INDEX `payroll_payslips_employee_id_index` (`employee_id`),
  CONSTRAINT `payroll_payslips_tenant_id_foreign` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `payroll_payslips_payroll_run_id_foreign` FOREIGN KEY (`payroll_run_id`) REFERENCES `payroll_runs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `payroll_client_configs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `version` INT NOT NULL,
  `settings_json` JSON NOT NULL,
  `effective_from` DATE NOT NULL,
  `effective_to` DATE NULL,
  `created_by` CHAR(36) NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `payroll_client_configs_tenant_id_version_unique` (`tenant_id`, `version`),
  INDEX `payroll_client_configs_tenant_id_index` (`tenant_id`),
  INDEX `payroll_client_configs_created_by_index` (`created_by`),
  CONSTRAINT `payroll_client_configs_tenant_id_foreign` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
