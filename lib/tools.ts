import { supabase } from "@/lib/supabase";
import { tool } from "ai";
import { z } from "zod";

const getAllUsers = tool({
  description: "Get all users",
  execute: async () => {
    const { data, error } = await supabase.from("users").select("*");
    if (error) {
      throw new Error(error.message);
    }
    console.log(data);
    return data;
  },
});

const getUserTool = tool({
  description: "Get user by id or policynumber or phonenumber",
  parameters: z.object({
    id: z.string().optional(),
    policynumber: z.string().optional(),
    phonenumber: z.string().optional(),
  }),
  execute: async ({ id, policynumber, phonenumber }) => {
    if (!id && !policynumber && !phonenumber) {
      throw new Error("Please provide id, policynumber or phonenumber");
    }
    if (id) {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", id);
      if (error) {
        throw new Error(error.message);
      }
      console.log(data);
      return data;
    }
    if (policynumber) {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("policy_number", policynumber);
      if (error) {
        throw new Error(error.message);
      }
      console.log(data);
      return data;
    }
    if (phonenumber) {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("phone", phonenumber);

      if (error) {
        throw new Error(error.message);
      }
      console.log(data);
      return data;
    }
  },
});

const createUserTool = tool({
  description: "Create a new user",
  parameters: z.object({
    name: z.string(),
    phone: z.string(),
    address: z.string(),
    policynumber: z.string(),
    numberplate: z.string(),
    registration: z.string(),
    information: z
      .string()
      .optional()
      .describe("Only give information in json format"),
  }),
  execute: async ({
    name,
    phone,
    address,
    policynumber,
    numberplate,
    registration,
  }) => {
    const { data, error } = await supabase
      .from("users")
      .insert({
        name: name,
        phone: phone,
        address: address,
        policy_number: policynumber,
        number_plate: numberplate,
        vehicle_registration: registration,
      })
      .select();
    if (error) {
      return { success: false, message: error.message };
    }
    return data;
  },
});

const getAllClaims = tool({
  description: "Get all claims",
  execute: async () => {
    const { data, error } = await supabase.from("claims").select("*");
    if (error) {
      throw new Error(error.message);
    }
    console.log(data);
    return data;
  },
});

const createClaimBasicTool = tool({
  description:
    "Create a new claim (no images) for the provided schema. also the damages should be in json format",
  parameters: z.object({
    userId: z.string(),
    policyNumber: z.string(),
    damages: z.unknown().describe("Arbitrary JSON payload for damages"),
    claimDate: z.string(),
    location: z.string(),
  }),
  execute: async ({ userId, policyNumber, damages, claimDate, location }) => {
    // Normalize date to YYYY-MM-DD if not provided
    const dateOnly = claimDate ?? new Date().toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("claims")
      .insert({
        user_id: userId,
        policy_number: policyNumber ?? null,
        damages: damages ?? null, // JSON column
        claim_date: dateOnly as any, // date column (YYYY-MM-DD)
        location: location ?? null,
      })
      .select()
      .single();

    if (error) {
      return { success: false, message: error.message };
    }
    return { success: true, claim: data, message: `Claim ${data.id} created` };
  },
});

function base64ToFile(base64String: string, filename: string): File {
  const byteCharacters = atob(base64String);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new File([byteArray], filename, { type: "image/jpeg" });
}

// Helper function to upload annotated image to Supabase
async function uploadAnnotatedImageToSupabase(
  base64String: string,
  imageIndex: number,
): Promise<string> {
  try {
    const imageName = `annotated-damage-${Date.now()}-${imageIndex}.jpg`;
    const file = base64ToFile(base64String, imageName);

    const { error } = await supabase.storage
      .from("claim-images")
      .upload(imageName, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      console.error("Supabase upload error:", error);
      return "";
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("claim-images").getPublicUrl(imageName);

    return publicUrl;
  } catch (error) {
    console.error("Error uploading to Supabase:", error);
    return "";
  }
}

const damageTool = tool({
  description:
    "Detect damages from image URLs and return results with Supabase-hosted annotated images.",
  parameters: z.object({
    images: z.array(z.object({ url: z.string().url() }))
      .describe("Array of image URLs in this format [{'url': <url>}, ..]"),
  }),
  execute: async ({ images }) => {
    try {
      // Call your FastAPI server for detection
      const response = await fetch("http://localhost:8000/detect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ images }),
      });

      if (!response.ok) {
        throw new Error(
          `FastAPI error: ${response.status} ${response.statusText}`,
        );
      }

      const detectionResult = await response.json();

      // Upload each annotated image to Supabase and replace base64 with URLs
      const resultsWithSupabaseUrls = await Promise.all(
        detectionResult.results.map(async (result: any, index: number) => {
          let supabaseUrl = "";
          // Upload annotated image to Supabase if base64 exists
          if (result.annotated_image_base64) {
            supabaseUrl = await uploadAnnotatedImageToSupabase(
              result.annotated_image_base64,
              index,
            );
          }

          return {
            image_url: result.image_url,
            image_index: result.image_index,
            detections: result.detections,
            summary: result.summary,
            annotated_image_url: supabaseUrl, // Only return URL
            total_detections: result.total_detections,
            upload_success: !!supabaseUrl, // Add success indicator
          };
        }),
      );
      return {
        results: resultsWithSupabaseUrls,
        overall_summary: detectionResult.overall_summary,
        total_images_processed: detectionResult.total_images_processed,
        total_detections_across_all_images:
          detectionResult.total_detections_across_all_images,
        all_uploads_successful: resultsWithSupabaseUrls.every(
          (r) => r.upload_success,
        ),
      };
    } catch (error) {
      console.error("Damage detection error:", error);
      throw new Error(`Failed to process damage detection: ${error.message}`);
    }
  },
});

const createClaimTool = tool({
  description:
    "Create a complete insurance claim after collecting all required information from previous phases. Use ONLY after you have: 1) User data (userId, policyNumber) from get_user, 2) Damage analysis from damage_tool, 3) Car details (carId) from get_car, 4) Parts pricing from get_car_parts",
  parameters: z.object({
    userId: z.string().describe("User ID from get_user tool result"),
    policyNumber: z
      .string()
      .describe("Policy number from get_user tool result"),
    damages: z
      .unknown()
      .describe(
        "Complete damage results object from damage_tool. Include the full results array with detections, summaries, and annotated image URLs.",
      ),
    claimDate: z.string().describe("Date in YYYY-MM-DD format"),
    location: z.string().describe("Location where the incident occurred"),
    images: z
      .array(z.string())
      .describe(
        "Array of ALL image URLs. Must include: 1) Original uploaded image URLs, 2) Annotated image URLs from damage_tool results (annotated_image_url field from each result)",
      ),
    carId: z.string().describe("Car ID from get_car tool result"),
    repairCost: z
      .array(
        z.object({
          part_name: z.string(),
          damage: z.string(),
          part_cost: z.number(),
        }),
      )
      .describe(
        "Array of repair costs calculated by matching damages from damage_tool with parts from get_car_parts. Format: [{part_name: 'front bumper', damage: 'dent', part_cost: 500}, ...]",
      ),
  }),
  execute: async ({
    userId,
    policyNumber,
    damages,
    claimDate,
    location,
    images,
    carId,
    repairCost,
  }) => {
    try {
      // Validate required fields
      if (!userId || !policyNumber || !carId) {
        return {
          success: false,
          message:
            "❌ Missing required fields: userId, policyNumber, or carId. Make sure you've called get_user and get_car tools first.",
          validation_error: true,
        };
      }

      console.log("Creating claim with data:", {
        userId,
        policyNumber,
        carId,
        location,
        imageCount: images?.length,
        repairItemCount: repairCost?.length,
      });

      // Normalize date to YYYY-MM-DD
      const dateOnly = claimDate ?? new Date().toISOString().slice(0, 10);

      // Insert claim into database
      const { data, error } = await supabase
        .from("claims")
        .insert({
          user_id: userId,
          policy_number: policyNumber,
          damages: damages ?? null, // JSON column - store full damage analysis
          claim_date: dateOnly as any, // date column (YYYY-MM-DD)
          location: location ?? null,
          images: images ?? null, // Array of image URLs (original + annotated)
          vehicle_id: carId ?? null,
          repair: repairCost ?? null, // Array of repair cost objects
        })
        .select()
        .single();

      if (error) {
        console.error("Supabase error:", error);
        return {
          success: false,
          message: `❌ Failed to create claim: ${error.message}`,
          error_code: error.code,
          database_error: true,
        };
      }

      // Calculate total repair cost
      const totalCost =
        repairCost?.reduce((sum, item) => sum + (item.part_cost || 0), 0) || 0;

      // Count damages
      let damageCount = 0;
      if (damages && typeof damages === "object") {
        const d = damages as any;
        // Handle both damage_tool result format and simple damage counts
        if (d.total_detections_across_all_images !== undefined) {
          damageCount = d.total_detections_across_all_images;
        } else if (Array.isArray(d.results)) {
          damageCount = d.results.reduce(
            (sum: number, r: any) => sum + (r.total_detections || 0),
            0,
          );
        } else if (typeof d === "object") {
          // Simple damage counts like { dent: 2, scratch: 1 }
          damageCount = Object.values(d).reduce(
            (sum: number, val: any) =>
              sum + (typeof val === "number" ? val : 0),
            0,
          );
        }
      }

      console.log(`✅ Claim ${data.id} created successfully!`);

      return {
        success: true,
        claim: data,
        claimId: data.id,
        message: `✅ Claim ${data.id} created successfully!`,
        summary: {
          claim_id: data.id,
          user_id: userId,
          policy_number: policyNumber,
          claim_date: dateOnly,
          location: location,
          vehicle_id: carId,
          total_damages: damageCount,
          total_images: images?.length || 0,
          original_images:
            images?.filter((url) => !url.includes("annotated")).length || 0,
          annotated_images:
            images?.filter((url) => url.includes("annotated")).length || 0,
          repair_items: repairCost?.length || 0,
          estimated_repair_cost: totalCost,
        },
        phases_completed: {
          user_data: true,
          damage_analysis: damages !== null,
          car_details: true,
          parts_pricing: repairCost?.length > 0,
          claim_created: true,
        },
      };
    } catch (error) {
      console.error("Unexpected error in createClaimTool:", error);
      return {
        success: false,
        message: `❌ Unexpected error: ${error instanceof Error ? error.message : "Unknown error"}`,
        unexpected_error: true,
      };
    }
  },
});

const imageTool = tool({
  description: "Display an image from a URL",
  parameters: z.object({
    url: z.string().url().describe("The image URL"),
  }),
  execute: async ({ url }) => {
    return { url };
  },
});

const urlTool = tool({
  description: "Display a URL link",
  parameters: z.object({
    url: z.string().url().describe("The URL link"),
    text: z.string().optional().describe("Optional text to display"),
  }),
  execute: async ({ url, text }) => {
    return { url, text: text ?? url };
  },
});

const updateClaimTool = tool({
  description:
    "Update an existing insurance claim with new information. Can update any field including damages, location, images, and claim date. Provides detailed validation and maintains data integrity.",
  parameters: z.object({
    claimId: z.string().describe("The ID of the claim to update (required)"),
    userId: z
      .string()
      .describe("User ID for ownership verification")
      .optional(),
    policyNumber: z
      .string()
      .describe("Updated insurance policy number")
      .optional(),
    damages: z
      .unknown()
      .describe(
        "Updated damage details in JSON format. Can be simple counts like {'dent': 2} or detailed array from damage_tool with locations and severity",
      )
      .optional(),
    claimDate: z
      .string()
      .describe("Updated date in YYYY-MM-DD format")
      .optional(),
    location: z
      .string()
      .describe("Updated location where the incident occurred")
      .optional(),
    images: z
      .array(z.string())
      .describe(
        "Updated array of image URLs. Include both original claim-image URLs and annotated-damage URLs from damage analysis",
      )
      .optional(),
    addImages: z
      .array(z.string())
      .describe(
        "Array of image URLs to add to existing images (preserves current images)",
      )
      .optional(),
    removeImages: z
      .array(z.string())
      .describe("Array of image URLs to remove from existing images")
      .optional(),
  }),

  execute: async ({
    claimId,
    userId,
    policyNumber,
    damages,
    claimDate,
    location,
    images,
    addImages,
    removeImages,
  }) => {
    try {
      // Validate claim ID
      if (!claimId) {
        return {
          success: false,
          validation_error: true,
          message: "❌ Claim ID is required to update a claim",
        };
      }

      // First, fetch the existing claim to verify it exists and get current data
      const { data: existingClaim, error: fetchError } = await supabase
        .from("claims")
        .select("*")
        .eq("id", parseInt(claimId))
        .single();

      if (fetchError) {
        return {
          success: false,
          not_found: true,
          message: `❌ Claim #${claimId} not found: ${fetchError.message}`,
          error_code: fetchError.code,
        };
      }

      if (!existingClaim) {
        return {
          success: false,
          not_found: true,
          message: `❌ Claim #${claimId} does not exist`,
        };
      }

      // Verify ownership if userId is provided
      if (userId && existingClaim.user_id !== parseInt(userId)) {
        return {
          success: false,
          permission_denied: true,
          message: `❌ Access denied: User ${userId} cannot update claim #${claimId} (owned by user ${existingClaim.user_id})`,
        };
      }

      // Prepare update object with only provided fields
      const updateData: any = {};
      const changedFields: string[] = [];

      // Update policy number
      if (
        policyNumber !== undefined &&
        policyNumber !== existingClaim.policy_number
      ) {
        updateData.policy_number = policyNumber;
        changedFields.push(
          `Policy Number: ${existingClaim.policy_number} → ${policyNumber}`,
        );
      }

      // Update damages
      if (damages !== undefined) {
        const damagesString = JSON.stringify(damages);
        if (damagesString !== existingClaim.damages) {
          updateData.damages = damagesString;

          // Provide summary of damage changes
          let damagesSummary = "Damages updated";
          try {
            if (Array.isArray(damages)) {
              damagesSummary = `Updated to ${damages.length} detailed damage entries`;
            } else if (typeof damages === "object" && damages !== null) {
              const damageCount = Object.keys(damages).length;
              damagesSummary = `Updated to ${damageCount} damage type${damageCount !== 1 ? "s" : ""}`;
            }
          } catch (e) {
            // Fallback summary
          }
          changedFields.push(damagesSummary);
        }
      }

      // Update claim date
      if (claimDate !== undefined && claimDate !== existingClaim.claim_date) {
        updateData.claim_date = claimDate;
        changedFields.push(
          `Claim Date: ${existingClaim.claim_date} → ${claimDate}`,
        );
      }

      // Update location
      if (location !== undefined && location !== existingClaim.location) {
        updateData.location = location;
        changedFields.push(`Location: ${existingClaim.location} → ${location}`);
      }

      // Handle images updates
      let finalImages: string[] | null = null;
      let existingImages: string[] = [];

      try {
        existingImages = existingClaim.images
          ? JSON.parse(existingClaim.images)
          : [];
      } catch (e) {
        console.warn(
          "Could not parse existing images, treating as empty array",
        );
        existingImages = [];
      }

      if (images !== undefined) {
        // Complete replacement of images
        finalImages = images;
        changedFields.push(
          `Images: Replaced all ${existingImages.length} images with ${images.length} new images`,
        );
      } else {
        // Handle add/remove operations
        finalImages = [...existingImages];

        if (addImages && addImages.length > 0) {
          // Add new images (avoid duplicates)
          const newImages = addImages.filter(
            (img) => !finalImages!.includes(img),
          );
          finalImages.push(...newImages);
          if (newImages.length > 0) {
            changedFields.push(
              `Images: Added ${newImages.length} new image${newImages.length !== 1 ? "s" : ""}`,
            );
          }
        }

        if (removeImages && removeImages.length > 0) {
          // Remove specified images
          const initialCount = finalImages.length;
          finalImages = finalImages.filter(
            (img) => !removeImages.includes(img),
          );
          const removedCount = initialCount - finalImages.length;
          if (removedCount > 0) {
            changedFields.push(
              `Images: Removed ${removedCount} image${removedCount !== 1 ? "s" : ""}`,
            );
          }
        }
      }

      // Update images if they changed
      if (finalImages !== null) {
        const finalImagesString = JSON.stringify(finalImages);
        if (finalImagesString !== existingClaim.images) {
          updateData.images = finalImagesString;
        }
      }

      // Check if any changes were made
      if (Object.keys(updateData).length === 0) {
        return {
          success: true,
          no_changes: true,
          message: `ℹ️ No changes needed for claim #${claimId} - all provided values match current data`,
          claim: existingClaim,
        };
      }

      // Add updated timestamp
      updateData.updated_at = new Date().toISOString();

      // Perform the update
      const { data: updatedClaim, error: updateError } = await supabase
        .from("claims")
        .update(updateData)
        .eq("id", parseInt(claimId))
        .select()
        .single();

      if (updateError) {
        return {
          success: false,
          database_error: true,
          message: `❌ Failed to update claim #${claimId}: ${updateError.message}`,
          error_code: updateError.code,
          error_details: updateError.details,
        };
      }

      // Create detailed response
      const response: any = {
        success: true,
        claim: updatedClaim,
        claim_id: parseInt(claimId),
        message: `✅ Claim #${claimId} updated successfully!`,
        changes_made: changedFields,
        summary: {
          fields_updated: Object.keys(updateData).length - 1, // -1 for updated_at
          policy_number: updatedClaim.policy_number,
          location: updatedClaim.location,
          claim_date: updatedClaim.claim_date,
          total_images: finalImages
            ? finalImages.length
            : existingImages.length,
          updated_at: updateData.updated_at,
        },
        change_summary:
          changedFields.length > 0
            ? `Updated: ${changedFields.join(", ")}`
            : "No changes made",
      };

      // Add damage analysis if damages were updated
      if (damages !== undefined) {
        try {
          let damageAnalysis: any = {};

          if (Array.isArray(damages)) {
            // Detailed damages format
            const severityCounts = damages.reduce((acc: any, damage: any) => {
              acc[damage.severity] = (acc[damage.severity] || 0) + 1;
              return acc;
            }, {});

            const damageTypes = [
              ...new Set(damages.map((d: any) => d.damage_type)),
            ];

            damageAnalysis = {
              format: "detailed",
              total_damages: damages.length,
              damage_types: damageTypes,
              severity_breakdown: severityCounts,
              locations: damages
                .map((d: any) => d.location)
                .filter(
                  (l: string, i: number, arr: string[]) => arr.indexOf(l) === i,
                ),
            };
          } else if (typeof damages === "object" && damages !== null) {
            // Simple damages format
            const totalCount = Object.values(damages).reduce(
              (sum: number, count: any) =>
                sum + (typeof count === "number" ? count : 0),
              0,
            );

            damageAnalysis = {
              format: "simple",
              total_damages: totalCount,
              damage_types: Object.keys(damages),
              damage_counts: damages,
            };
          }

          response.damage_analysis = damageAnalysis;
        } catch (e) {
          // Don't fail the update if damage analysis fails
          console.warn("Could not analyze updated damages:", e);
        }
      }

      return response;
    } catch (error) {
      console.error("Unexpected error in updateClaimTool:", error);
      return {
        success: false,
        unexpected_error: true,
        message: `❌ Unexpected error updating claim #${claimId}: ${error instanceof Error ? error.message : "Unknown error"}`,
        error_type: error instanceof Error ? error.constructor.name : "Unknown",
      };
    }
  },
});

const getCarTool = tool({
  description: "Get details of a car by its name:",
  parameters: z.object({
    name: z
      .string()
      .describe(
        "The name of the car just the name not the manufacturer's name with it in this format: %creta% or %wagonr%",
      ),
  }),
  execute: async ({ name }) => {
    const { data, error } = await supabase
      .from("cars")
      .select("*")
      .ilike("name", name);
    if (error) {
      throw new Error(error.message);
    }
    console.log(data);
    return data;
  },
});

const getCarPartsTool = tool({
  description: "Get details of parts for a car by the car's id, or name:",
  parameters: z.object({
    id: z.number().optional(),
    name: z
      .string()
      .optional()
      .describe("The name of the car in this format: %creta% or %wagonr%"),
  }),
  execute: async ({ id, name }) => {
    if (!id && !name) {
      throw new Error("Please provide id or name");
    }
    if (id) {
      const { data, error } = await supabase
        .from("parts")
        .select("*")
        .eq("vehicle_id", id);
      if (error) {
        throw new Error(error.message);
      }
      console.log(data);
      return data;
    }
    if (name) {
      const { data, error } = await supabase
        .from("parts")
        .select("*")
        .ilike("vehicle_name", name);
      if (error) {
        throw new Error(error.message);
      }
      return data;
    }
  },
});

export const DataTools = {
  get_all_users: getAllUsers,
  get_user: getUserTool,
  get_all_claims: getAllClaims,
  create_claim: createClaimTool,
  create_claim_basic: createClaimBasicTool,
  create_user: createUserTool,
  image_tool: imageTool,
  url_tool: urlTool,
  damage_tool: damageTool,
  update_claim: updateClaimTool,
  get_car: getCarTool,
  get_car_parts: getCarPartsTool,
};
