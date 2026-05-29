package com.example.chrisfit

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Dao
interface AppDao {

    // ---------- ENTRIES ----------
    @Insert
    suspend fun insertEntry(entry: Entry)

    @Delete
    suspend fun deleteEntry(entry: Entry)

    @Query("SELECT * FROM Entry WHERE date = :date ORDER BY id DESC")
    fun getEntriesByDate(date: String): Flow<List<Entry>>

    @Query("SELECT * FROM Entry ORDER BY date DESC, id DESC")
    fun getAllEntries(): Flow<List<Entry>>

    // ---------- FOOD ----------
    @Insert
    suspend fun insertFood(food: Food)

    @Delete
    suspend fun deleteFood(food: Food)

    @Query("SELECT * FROM Food ORDER BY id DESC")
    fun getAllFoods(): Flow<List<Food>>

    // ---------- SETTINGS ----------
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSettings(settings: Settings)

    @Query("SELECT * FROM Settings LIMIT 1")
    fun getSettings(): Flow<Settings?>

    // ---------- WEIGHT ----------
    @Insert
    suspend fun insertWeight(weight: Weight)

    @Delete
    suspend fun deleteWeight(weight: Weight)

    @Query("SELECT * FROM Weight ORDER BY date DESC")
    fun getAllWeights(): Flow<List<Weight>>

    @Query("SELECT * FROM Weight ORDER BY id DESC LIMIT 1")
    fun getLatestWeight(): Flow<Weight?>

    // ---------- DELETE ALL ----------
    @Query("DELETE FROM Entry")
    suspend fun deleteAllEntries()

    @Query("DELETE FROM Food")
    suspend fun deleteAllFoods()

    @Query("DELETE FROM Weight")
    suspend fun deleteAllWeights()

    // ---------- EXPORT HELPERS ----------
    @Query("SELECT * FROM Entry")
    suspend fun getAllEntriesOnce(): List<Entry>

    @Query("SELECT * FROM Food")
    suspend fun getAllFoodsOnce(): List<Food>

    @Query("SELECT * FROM Weight")
    suspend fun getAllWeightsOnce(): List<Weight>
}