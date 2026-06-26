import { publicProcedure, router } from "./trpcInit";
import { number } from "valibot";
import { profilePictureRouter } from "./profilePicture";
 
export const appRouter = router({
    // Add your internal procedures/sub-routers here
    addOne: publicProcedure.input(number()).mutation(async ({ input }) => {
        return input + 1;
    }),
    profilePicture: profilePictureRouter,
});
 
export type AppRouter = typeof appRouter;
