import mongoose from "mongoose";

const kitSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    inputHash: { type: String, required: true },
    companyUrl: { type: String, required: true },
    jobDescription: { type: String, required: true },
    days: { type: Number, required: true, min: 1, max: 60 },
    status: { type: String, enum: ["processing", "completed", "failed"], default: "processing" },
    stage: { type: String, default: "queued" },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    kitData: { type: mongoose.Schema.Types.Mixed, default: null },
    error: {
      code: { type: String, default: null },
      message: { type: String, default: null }
    }
  },
  { timestamps: true }
);

kitSchema.index({ userId: 1, inputHash: 1 }, { unique: true });

export default mongoose.model("Kit", kitSchema);
