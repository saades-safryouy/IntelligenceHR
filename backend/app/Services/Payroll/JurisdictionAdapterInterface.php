<?php

namespace App\Services\Payroll;

/**
 * The core ↔ profile contract (BRD §5.2). This interface is the
 * boundary that keeps country-specific rules out of the core engine:
 * the core runs the generic pipeline; the adapter implements the
 * country's rules, reading only the parameter set and the component
 * catalog. An adapter never contains a literal rate, bracket, ceiling
 * or cap, and never calls another profile's code. An adapter that
 * cannot compute a required value must fail loudly (named error) —
 * never silently return 0 or a guessed value.
 *
 * Component arrays passed to the exemption hooks carry the catalog's
 * generic treatment flags: code, category, cnss_subject, ir_subject,
 * cap_type, cap_value, counts_toward_tax_abatement.
 */
interface JurisdictionAdapterInterface
{
    /** Profile code, e.g. 'MA'. */
    public function code(): string;

    /** Profile version, e.g. '1.0'. */
    public function profileVersion(): string;

    /** Exempt part of a component amount for the social base (0..amount). */
    public function socialExemption(array $component, float $amount, ParameterSet $params): float;

    /** Exempt part of a component amount for the tax base (0..amount). */
    public function taxExemption(array $component, float $amount, ParameterSet $params): float;

    /**
     * Contribution branches. Each: ['key', 'employee_rate',
     * 'employer_rate', 'ceiling' (null = no ceiling)].
     */
    public function contributionBranches(ParameterSet $params): array;

    /**
     * Overtime pay for the period. Adapters must return 0.0 without
     * reading any uplift parameter when no overtime hours are given,
     * so a run without overtime never fails on a missing uplift key.
     */
    public function overtimeAmount(array $overtime, ParameterSet $params): float;

    /**
     * Taxable income after abatements. Returns ['taxable_income',
     * 'sbi' (taxable income before abatements), 'abatements' =>
     * [['key', 'amount'], ...]]. $taxBase is gross minus the profile's
     * tax exemptions; $employeeContributions is the employee's total
     * social contributions for the period.
     */
    public function taxableIncome(float $taxBase, float $employeeContributions, array $context, ParameterSet $params): array;

    /**
     * Tax due for the period. Returns ['tax', 'details' => [...] with
     * the adapter's breakdown]. $context carries 'dependants' and
     * 'period' at minimum.
     */
    public function computeTax(float $netTaxable, array $context, ParameterSet $params): array;

    /** Statutory minimum wage (hourly), or null when the profile defines none. */
    public function minimumWage(ParameterSet $params): ?float;

    /** The payslip's mandatory mentions for this jurisdiction. */
    public function mandatoryPayslipMentions(): array;

    /** Extra per-country run checks: [['code', 'message', 'blocking']]. */
    public function validationChecks(array $runContext): array;

    /** The export formats this jurisdiction requires. */
    public function reportingPack(): array;
}
