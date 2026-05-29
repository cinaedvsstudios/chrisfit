package com.example.chrisfit

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity
data class Settings(
    @PrimaryKey val id: Int = 1,
    val dailyCalories: Int,
    val dailyDeficit: Int,
    val bmr: Int
)