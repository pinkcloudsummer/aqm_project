I want a statistics section on each individual metric tab if you scroll down far enough, the statistics are
- correlation (P - but if you can find a RHO symbol to use that would be better)
- std deviation (the symbol)
- a probablilty curve at the day & week level of avg values, top values, and low values. 6 total probabilty curves
- clicking on the Rho symbol should bring you to a screen that hosts a bunch of correlations / cross correlations 
- these corrrelations should be things like, CO2 and NOx have an inverse correlation of 0.X, more spikes of XYZ gas are present with higher humidity, far more voc spikes correlated with it being evening than morning, etc (come up with a few more) - all of these should be accompanied with a visual to emphasie the relationship
- additional examples Humidity staying high overnight consistently (mold risk indicator), VOC spikes clustering on specific days, PM2.5 correlated with humidity (outdoor pollution infiltration pattern)
- the insights should come from these statstics data
6. Plant Transpiration vs. Humidity

Since you have an interest in soil monitoring and IoT, you can link the two.

    Statistic: Vapor Pressure Deficit (VPD).

    How to track: This uses temperature and relative humidity to determine the drying power of the air. It’s a critical stat for plant health—tracking how your indoor air quality affects your soil moisture evaporation rates creates a neat "closed-loop" data story for your home garden.



- please also include a section for "Insights" where we can summarize the key findings from the statistics and correlations. This section can highlight any significant patterns or trends that have been identified, such as specific times of day when certain metrics tend to spike, or any notable relationships between different metrics. The insights should be presented in a clear and concise manner, making it easy for users to understand the implications of the data.

- I want to setup linkage between the different screens to the other screens so that users can easily navigate between the statistics, correlations, and insights sections. this should be centered around individual materics tabs (organize the data model in this way:
- the statistics and cocorrelations should be linked to the specific metric they pertain to, 
- statistics and correlations should be tables that we also store on the back end for storage at the end of the day, so I can see the history of the statistics and correlations as well
- there should be a key in these tables that links the items in the tables to the specifics metric they're related to



allowing users to easily access relevant information without having to navigate through unrelated data. For example, if a user is viewing the statistics for CO2 levels, they should be able to click on the Rho symbol to see correlations specifically related to CO2, such as its relationship with humidity or VOCs.

- there should be a way to return to the main dashboard or other metric tabs from any of these screens for seamless navigation.
- connect up all the items on screens to the right areas in other panels, for example:
    - click on temp lo in overnight screen, it should take you to the temperature tab, with a clear back link to the overnight screen
    - click on the ch4 in the overnight screen, it should take you to the CH4 screen, with a clear back link to the overnight screen
- when you go into the specific meatric screen, like CO2, the navigation bar is adjusted in the following ways:
    - the synbol changes to a CO2 symbol
    - the title of the navigation bar changes to "co2"
    - if you hit back it should take you back to the previous screen, the symbol in the nav and the title of the nav also flip back to the previous screen's symbol and title

- the daily value distribution should emphasize mor the comparision between hourlse, daily, and monthly distributions of the CO2 metric for the Avg, them emphasive the hourly, daily, and monthly distributions of the high values, and then the hourly, daily, and monthly distributions of the low values. this should be done for each metric. the idea is to give users a clear picture of how the distribution of values changes across different time scales, and to highlight any patterns or trends that may be present in the data. 

- ok this looks great - do we know move onto phase 1 which would be to wire this thing up for real?



1. Pressure-Driven Infiltration (The "Bellows Effect")

Indoor air quality isn't just about what's inside; it's about how much the building "breathes" through cracks in windows and doors.

    Statistic: Delta-P Infiltration Bias.

    How to track: Compare your indoor pressure (via BMP280/388) to local barometric pressure from a weather API. When indoor pressure is lower than outdoor pressure (negative pressure), your apartment pulls in unfiltered air. Correlate this with PM2.5 spikes to see if your indoor air quality is at the mercy of outside wind speed and pressure differentials.

3. Light-Mediated VOC Photolysis

Some volatile organic compounds break down or react when exposed to specific wavelengths of light (especially UV or bright sunlight).

    Statistic: Photochemical VOC Decay Rate.

    How to track: Using an LDR (Light Dependent Resistor) or a dedicated UV sensor, track VOC levels during peak sunlight hours versus overcast days. You might find that high light levels actually reduce certain VOCs through oxidation, or conversely, trigger off-gassing from treated fabrics and plastics in your apartment.

4. Circadian Metabolic Peak (Human vs. Plant)Both you and your plants have a biological "rhythm" that changes air chemistry.Statistic: Net Carbon Exchange (NCE).How to track: Use light data to define "Day" (Photosynthesis) and "Night" (Respiration). During the day, measure the rate of $CO_2$ increase while you are home; at night, do the same. Subtracting your estimated metabolic rate (which stays relatively flat while sleeping) lets you see the "Carbon Sink" efficiency of your indoor plants—essentially a scoreboard of how much $CO_2$ they are actually scrubbing for you.

5. Storm-Front VOC "Outgassing"

Rapid drops in atmospheric pressure can actually "pull" gases out of porous materials like carpets, drywall, and sofa foam.

    Statistic: Barometric VOC Sensitivity.

    How to track: During a storm (watch for a rapid drop in hPa on your BMP388), monitor your VOC index. If VOCs spike as pressure drops—without any cooking or cleaning activity—you’ve identified the "Material Memory" of your furniture off-gassing in response to the pressure change.

