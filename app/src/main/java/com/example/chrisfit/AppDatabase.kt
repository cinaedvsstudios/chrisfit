package com.example.chrisfit

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [
        Entry::class,
        Food::class,
        Settings::class,
        Weight::class   // ✅ THIS WAS MISSING
    ],
    version = 2, // ✅ bump version
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {

    abstract fun appDao(): AppDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "chrisfit_db"
                )
                    .fallbackToDestructiveMigration() // ✅ REQUIRED for version change
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}