<?php

namespace App\Services\Payroll;

/** Thrown when a calculation needs a parameter the set does not contain. Never silently defaulted (BRD §7.4, §11.1 rule 1). */
class MissingPayrollParameterException extends \RuntimeException
{
    public static function forKey(string $key): self
    {
        return new self("Missing payroll parameter: {$key}");
    }
}
