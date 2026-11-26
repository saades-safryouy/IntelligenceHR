<?php

namespace Tests\Unit;

use Database\Seeders\DemoEmployeesSeeder;
use PHPUnit\Framework\TestCase;

/**
 * Pure checks on the DemoEmployeesSeeder data lists — no app boot,
 * no DB. Written, NOT run (no PHPUnit in this environment).
 */
class DemoEmployeesSeederTest extends TestCase
{
    /** The 6 original employees (DatabaseSeeder, ids 1043–1048). */
    private const EXISTING_EMAILS = [
        'nadia.rahmani@intillj.com',
        'karim.haddad@intillj.com',
        'maya.elamrani@intillj.com',
        'omar.bennani@intillj.com',
        'ahmed.benali@intillj.com',
        'saad.hr@intillj.com',
    ];

    public function test_adds_exactly_44_employees(): void
    {
        $this->assertCount(44, DemoEmployeesSeeder::people());
    }

    public function test_emails_are_unique_demo_domain_and_do_not_collide(): void
    {
        $emails = array_column(DemoEmployeesSeeder::people(), 'email');

        $this->assertCount(44, array_unique($emails));

        foreach ($emails as $email) {
            $this->assertStringEndsWith('@intelligence-rh.example.test', $email);
            $this->assertNotContains($email, self::EXISTING_EMAILS);
        }
    }

    public function test_names_are_unique_and_non_empty(): void
    {
        $names = array_map(
            fn (array $p): string => $p['first_name'].' '.$p['last_name'],
            DemoEmployeesSeeder::people()
        );

        $this->assertCount(44, array_unique($names));

        foreach (DemoEmployeesSeeder::people() as $p) {
            $this->assertNotEmpty(trim($p['first_name']));
            $this->assertNotEmpty(trim($p['last_name']));
        }
    }

    public function test_department_gender_and_status_mix(): void
    {
        $people = DemoEmployeesSeeder::people();

        $this->assertSame(
            ['eng' => 14, 'ops' => 10, 'sales' => 9, 'finance' => 6, 'people' => 5],
            array_count_values(array_column($people, 'department_id'))
        );
        $this->assertSame(
            ['Male' => 22, 'Female' => 22],
            array_count_values(array_column($people, 'gender'))
        );
        $this->assertSame(
            ['Active' => 41, 'On Leave' => 3],
            array_count_values(array_column($people, 'status'))
        );
    }

    public function test_join_dates_are_valid_and_spread_2019_to_2026(): void
    {
        $years = [];
        foreach (DemoEmployeesSeeder::people() as $p) {
            $date = \DateTimeImmutable::createFromFormat('Y-m-d', $p['joined_at']);
            $this->assertNotFalse($date, "Bad joined_at for {$p['email']}: {$p['joined_at']}");
            $this->assertSame($p['joined_at'], $date->format('Y-m-d'));
            $years[] = (int) $date->format('Y');
        }

        $this->assertSame(
            [2019 => 4, 2020 => 5, 2021 => 8, 2022 => 6, 2023 => 7, 2024 => 6, 2025 => 5, 2026 => 3],
            array_count_values($years)
        );
    }
}
