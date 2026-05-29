package com.example.chrisfit

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity
data class Weight(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val value: Float,
    val date: String
)