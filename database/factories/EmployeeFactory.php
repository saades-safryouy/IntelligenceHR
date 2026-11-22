<?php

namespace Database\Factories;

use App\Models\Employee;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Employee>
 */
class EmployeeFactory extends Factory
{
    protected $model = Employee::class;

    public function definition(): array
    {
        return [
            'first_name' => fake()->firstName(),
            'last_name' => fake()->lastName(),
            'job_title' => fake()->jobTitle(),
            'status' => fake()->randomElement(['Active', 'On Leave', 'Suspended', 'Terminated']),
            'employment_type' => fake()->randomElement(['Full-time', 'Part-time', 'Contractor']),
            'location' => fake()->city(),
            'country' => fake()->randomElement(['MA', 'FR']),
            'joined_at' => fake()->date(),
            'email' => fake()->unique()->safeEmail(),
        ];
    }
}
