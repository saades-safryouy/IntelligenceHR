<?php

namespace App\Services\Payroll;

/**
 * An immutable, effective-dated set of legal parameters for one
 * jurisdiction profile version (BRD §7.4). The engine reads every
 * number from here — never from a literal in code (§11.1 rule 1).
 * A missing key fails loudly; there is no fallback value.
 */
final class ParameterSet
{
    /**
     * @param array<string, float|int|string> $values key => value
     */
    public function __construct(
        public readonly string $jurisdictionCode,
        public readonly string $profileVersion,
        public readonly ?int $id = null,
        public readonly ?string $validFrom = null,
        private readonly array $values = [],
    ) {}

    public function has(string $key): bool
    {
        return array_key_exists($key, $this->values);
    }

    /** @throws MissingPayrollParameterException */
    public function get(string $key): float|int|string
    {
        if (! $this->has($key)) {
            throw MissingPayrollParameterException::forKey($key);
        }

        return $this->values[$key];
    }

    /** @throws MissingPayrollParameterException */
    public function getFloat(string $key): float
    {
        return (float) $this->get($key);
    }

    /** @throws MissingPayrollParameterException */
    public function getInt(string $key): int
    {
        return (int) $this->get($key);
    }

    /** The raw map (for snapshots / debugging). */
    public function all(): array
    {
        return $this->values;
    }
}
