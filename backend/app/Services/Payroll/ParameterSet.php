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
     * @param array<string, string> $confidences key => confidence label
     *   ('secondary' | 'corroborated' | 'confirmed' | 'official').
     *   Keys without an entry count as unvalidated.
     */
    public function __construct(
        public readonly string $jurisdictionCode,
        public readonly string $profileVersion,
        public readonly ?int $id = null,
        public readonly ?string $validFrom = null,
        private readonly array $values = [],
        private readonly array $confidences = [],
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

    /** Confidence label of a key, or null when the set carries none. */
    public function confidence(string $key): ?string
    {
        return $this->confidences[$key] ?? null;
    }

    /**
     * Whether a parameter counts as validated for closing a run (BRD
     * §12.3 step 3b — the close-block hook, used by P3). 'official'
     * is the label the close-block uses; 'confirmed' (BRD §7.4's
     * wording for the same thing) counts too. Anything else —
     * including 'secondary' and a missing label — is unvalidated.
     */
    public function isValidated(string $key): bool
    {
        return in_array($this->confidence($key), ['official', 'confirmed'], true);
    }

    /**
     * Keys whose confidence is not validated. With $keys given, only
     * those are checked (e.g. the keys a calculation actually used —
     * MoroccoPayrollAdapter::usedParameterKeys()); without, every key
     * in the set. A key missing from the set counts as unvalidated.
     *
     * @param array<int, string>|null $keys
     * @return array<int, string>
     */
    public function unvalidatedKeys(?array $keys = null): array
    {
        $keys ??= array_keys($this->values);
        $unvalidated = [];
        foreach ($keys as $key) {
            if (! $this->isValidated($key)) {
                $unvalidated[] = $key;
            }
        }

        return $unvalidated;
    }
}
